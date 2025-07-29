const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mysql = require("mysql2");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || "@Nsw00218";

const nodemailer = require("nodemailer");

// Configure Nodemailer with more secure settings
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD, // App password from Google
  },
  secure: true,
  tls: {
    rejectUnauthorized: false // Only use during development
  }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public")); // Serve static files
app.use("/uploads", express.static("uploads")); // Serve uploaded files

// Database Connection
const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "@Nsw00218",
  database: process.env.DB_NAME || "edufund",
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
    return;
  }
  console.log("Connected to MySQL database");
});

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: "./uploads",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
  },
});
const upload = multer({ storage });

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "Unauthorized: Please log in." });

  jwt.verify(token, SECRET_KEY, (err, user) => {
      if (err) return res.status(403).json({ message: "Forbidden: Invalid token." });

      req.user = user; // Save user details for further processing
      next();
  });
};

// Routes

// User Registration
// User Registration with Detailed Error Handling
app.post("/register", async (req, res) => {
  const { username, email, password, gender, dob, phone, userType, school_registration_number } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // Check for existing username
    const [usernameCheck] = await db.promise().query(
      "SELECT * FROM users WHERE username = ?", 
      [username]
    );

    if (usernameCheck.length > 0) {
      return res.status(409).json({ 
        message: "Username is already taken. Please choose a different username.",
        field: "username"
      });
    }

    // Check for existing email
    const [emailCheck] = await db.promise().query(
      "SELECT * FROM users WHERE email = ?", 
      [email]
    );

    if (emailCheck.length > 0) {
      return res.status(409).json({ 
        message: "Email is already registered. Please use a different email.",
        field: "email"
      });
    }

    // If user type is student, check for unique school registration number
    if (userType === 'student' && school_registration_number) {
      const [schoolRegCheck] = await db.promise().query(
        "SELECT * FROM users WHERE school_registration_number = ?", 
        [school_registration_number]
      );

      if (schoolRegCheck.length > 0) {
        return res.status(409).json({ 
          message: "This school registration number is already in use.",
          field: "school_registration_number"
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10); // Hash password

    const role = userType === 'donor' ? 'donor' : 'student';

    // Handle school_registration_number for donors
    const schoolRegNumber = userType === 'student' ? school_registration_number : null;

    // Insert the user into the database
    db.query(
      "INSERT INTO users (username, email, password, gender, dob, school_registration_number, phone, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [username, email, hashedPassword, gender, dob, schoolRegNumber, phone, role],
      (err, result) => {
        if (err) {
          console.error("Error registering user:", err);
          
          // Handle potential MySQL unique constraint errors
          if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ 
              message: "A user with these credentials already exists.",
              details: err.sqlMessage 
            });
          }

          return res.status(500).json({ message: "Database error" });
        }

        // Send a registration confirmation email
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: email,
          subject: "Welcome to EduFund!",
          html: `<p>Thank you for registering with EduFund, ${username}!</p>
                 <p>You can now log in to your account and start exploring the platform.</p>`,
        };

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error("Error sending email - DETAILS:", error);
            return res.status(500).json({ message: "Failed to send registration confirmation email" });
          }
        
          console.log("Registration confirmation email sent:", info.response);
          res.status(201).json({ message: "Registration successful! A confirmation email has been sent." });
        });
      }
    );
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Server error during registration" });
  }
});
// User Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.query("SELECT * FROM users WHERE username = ?", [username], async (err, results) => {
      if (err) return res.status(500).json({ message: "Server error" });

      if (results.length === 0) return res.status(401).json({ message: "Invalid credentials" });

      const user = results[0];
      const validPassword = await bcrypt.compare(password, user.password);

      if (!validPassword) return res.status(401).json({ message: "Invalid password" });

      const token = jwt.sign({ username: user.username, role: user.role }, SECRET_KEY, { expiresIn: "1h" });

      res.json({ token, user: { username: user.username, role: user.role } });
  });
});

// Create a New Campaign
app.post("/create-campaign", authenticateToken, upload.single("campaign_image"), async (req, res) => {
  try {
      const {
          title,
          description,
          goal_amount,
          category,
          start_date,
          end_date,
          campaign_video,
          beneficiaries,
          expected_impact,
          challenges,
      } = req.body;

      // Validate required fields
      if (!title || !description || !goal_amount) {
          return res.status(400).json({ message: "Missing required fields." });
      }

      // Validate start date and end date
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Set time to midnight for accurate comparison

      const startDate = new Date(start_date);
      const endDate = new Date(end_date);

      if (startDate < today) {
          return res.status(400).json({ message: "Start date cannot be earlier than today." });
      }

      if (endDate < startDate) {
          return res.status(400).json({ message: "End date cannot be earlier than the start date." });
      }

      const campaign_image = req.file ? req.file.filename : null; // Get uploaded file name
      const username = req.user.username;

      const query = `
          INSERT INTO projects (title, description, goal_amount, raised_amount, category, start_date, end_date, campaign_image, campaign_video, beneficiaries, expected_impact, challenges, username)
          VALUES (?, ?, ?, 0.00, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const [result] = await db.promise().query(query, [
          title,
          description,
          goal_amount,
          category,
          start_date,
          end_date,
          campaign_image,
          campaign_video,
          beneficiaries,
          expected_impact,
          challenges,
          username,
      ]);

      res.status(201).json({ message: "Campaign created successfully!" });
  } catch (error) {
      console.error("Error inserting campaign:", error);
      res.status(500).json({ message: "Database error", error: error.message });
  }
});

// Get All Approved Campaigns
app.get("/campaigns", (req, res) => {
  const query = "SELECT * FROM projects WHERE status = 'approved'"; // Only fetch approved campaigns
  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching projects:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// Get Campaign by ID
app.get("/campaigns/:id", (req, res) => {
  const campaignId = req.params.id;

  const query = `
    SELECT 
      title, description, goal_amount, raised_amount, username, campaign_image, 
      category, start_date, end_date, campaign_video, beneficiaries, expected_impact, challenges 
    FROM projects 
    WHERE project_id = ?
  `;
  db.query(query, [campaignId], (err, results) => {
    if (err) {
      console.error("Error fetching campaign:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    res.json(results[0]); // Return the first (and only) campaign result
  });
});

// Get User Projects
app.get("/user-projects", authenticateToken, (req, res) => {
  const username = req.user.username;

  db.query("SELECT * FROM projects WHERE username = ?", [username], (err, results) => {
    if (err) {
      console.error("Error fetching user projects:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// Add this route to your server.js file
app.get("/statistics", async (req, res) => {
  try {
      // Fetch total projects
      const [projectsResult] = await db.promise().query("SELECT COUNT(*) as totalProjects FROM projects");
      const totalProjects = projectsResult[0].totalProjects;

      // Fetch total donations
      const [donationsResult] = await db.promise().query("SELECT SUM(raised_amount) as totalDonations FROM projects");
      const totalDonations = donationsResult[0].totalDonations || 0;

      // Fetch total users
      const [usersResult] = await db.promise().query("SELECT COUNT(*) as totalUsers FROM users");
      const totalUsers = usersResult[0].totalUsers;

      res.json({ totalProjects, totalDonations, totalUsers });
  } catch (error) {
      console.error("Error fetching statistics:", error);
      res.status(500).json({ message: "Error fetching statistics" });
  }
});

// Handle Donations
app.post("/donate", async (req, res) => {
  console.log("Incoming donation request:", req.body);

  const { projectId, donorName, phone, amount } = req.body;

  // Validate required fields
  if (!projectId || !donorName || !phone || !amount ) {
      console.error("Missing fields in donation request:", req.body);
      return res.status(400).json({ message: "All fields are required" });
  }

  // Log the parsed fields for debugging
  console.log("Parsed Fields:", { projectId, donorName, phone, amount });

  try {
      const insertDonationQuery = `
          INSERT INTO donations (project_id, donor_name, phone, amount)
          VALUES (?, ?, ?, ?)
      `;
      await db.promise().query(insertDonationQuery, [parseInt(projectId), donorName, phone, amount]);

      const updateProjectQuery = `
          UPDATE projects
          SET raised_amount = raised_amount + ?
          WHERE project_id = ?
      `;
      await db.promise().query(updateProjectQuery, [amount, parseInt(projectId)]);

      res.status(201).json({ message: "Donation processed successfully!" });
  } catch (error) {
      console.error("Error processing donation:", error);
      res.status(500).json({ message: "Failed to process donation" });
  }
});

// Get 2 random featured projects
app.get("/featured-projects", (req, res) => {
  const query = "SELECT * FROM projects ORDER BY RAND() LIMIT 2"; // Fetch 2 random projects
  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching featured projects:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// Get Donations for a Specific Project
app.get("/donations/:projectId", authenticateToken, (req, res) => {
    const projectId = req.params.projectId;

    const query = `
        SELECT donation_id, donor_name, amount, donation_date 
        FROM donations 
        WHERE project_id = ?
    `;

    db.query(query, [projectId], (err, results) => {
        if (err) {
            console.error("Error fetching donations:", err);
            return res.status(500).json({ message: "Database error" });
        }
        res.json(results);
    });
});


// Update a Project
app.put("/projects/:id", authenticateToken, upload.single("campaign_image"), async (req, res) => {
  const projectId = req.params.id;
  const {
      title,
      description,
      goal_amount,
      category,
      start_date,
      end_date,
      campaign_video,
      beneficiaries,
      expected_impact,
      challenges,
  } = req.body;

  try {
      // First, check if there is a new image uploaded
      let imageUpdateClause = '';
      let params = [
          title,
          description,
          goal_amount,
          category,
          start_date,
          end_date,
          campaign_video,
          beneficiaries,
          expected_impact,
          challenges,
      ];
      
      // If a new image was uploaded, include it in the update
      if (req.file) {
          imageUpdateClause = 'campaign_image = ?, ';
          params.splice(6, 0, req.file.filename); // Insert image filename at position 6
      }

      const query = `
          UPDATE projects 
          SET 
              title = ?, 
              description = ?, 
              goal_amount = ?, 
              category = ?, 
              start_date = ?, 
              end_date = ?, 
              ${imageUpdateClause}
              campaign_video = ?, 
              beneficiaries = ?, 
              expected_impact = ?, 
              challenges = ?
          WHERE project_id = ?
      `;

      // Add projectId as the last parameter
      params.push(projectId);

      await db.promise().query(query, params);

      res.status(200).json({ message: "Project updated successfully!" });
  } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ message: "Database error", error: error.message });
  }
});

// Admin Routes

// Admin-only Middleware
const checkAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }
  next();
};

// Admin Routes
app.get("/admin/users", authenticateToken, checkAdmin, (req, res) => {
  db.query("SELECT user_id, username, email, role FROM users", (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });
    res.json(results);
  });
});

app.get("/admin/campaigns", authenticateToken, checkAdmin, (req, res) => {
  db.query("SELECT * FROM projects", (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });
    res.json(results);
  });
});

app.get("/admin/donations", authenticateToken, checkAdmin, (req, res) => {
  const query = `SELECT d.donation_id, d.donor_name, d.amount, p.title AS campaign_title, d.donation_date 
                 FROM donations d 
                 JOIN projects p ON d.project_id = p.project_id`;
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });
    res.json(results);
  });
});
// Approve Campaign
app.post("/admin/approve-campaign/:id", authenticateToken, checkAdmin, (req, res) => {
  const campaignId = req.params.id;
  db.query("UPDATE projects SET status = 'approved' WHERE project_id = ?", [campaignId], (err) => {
    if (err) return res.status(500).json({ message: "Database error" });
    res.json({ message: "Campaign approved successfully!" });
  });
});

// Reject Campaign
app.post("/admin/reject-campaign/:id", authenticateToken, checkAdmin, (req, res) => {
  const campaignId = req.params.id;
  db.query("UPDATE projects SET status = 'rejected' WHERE project_id = ?", [campaignId], (err) => {
    if (err) return res.status(500).json({ message: "Database error" });
    res.json({ message: "Campaign rejected successfully!" });
  });
});

// Delete Campaign
app.delete("/admin/delete-campaign/:id", authenticateToken, checkAdmin, (req, res) => {
  const campaignId = req.params.id;

  db.query("DELETE FROM projects WHERE project_id = ?", [campaignId], (err) => {
      if (err) return res.status(500).json({ message: "Database error" });
      res.json({ message: "Campaign deleted successfully!" });
  });
});

// Delete User
app.delete("/admin/delete-user/:id", authenticateToken, checkAdmin, (req, res) => {
  const userId = req.params.id;

  db.query("DELETE FROM users WHERE user_id = ?", [userId], (err) => {
      if (err) return res.status(500).json({ message: "Database error" });
      res.json({ message: "User deleted successfully!" });
  });
});

// Delete Donation
app.delete("/admin/delete-donation/:id", authenticateToken, checkAdmin, (req, res) => {
  const donationId = req.params.id;

  db.query("DELETE FROM donations WHERE donation_id = ?", [donationId], (err) => {
      if (err) return res.status(500).json({ message: "Database error" });
      res.json({ message: "Donation deleted successfully!" });
  });
});

// Filter donations by date
app.get("/admin/donations-by-date", authenticateToken, checkAdmin, (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
      return res.status(400).json({ message: "Both startDate and endDate are required." });
  }

  const query = `
      SELECT d.donation_id, d.donor_name, d.amount, p.title AS campaign_title, d.donation_date 
      FROM donations d 
      JOIN projects p ON d.project_id = p.project_id
      WHERE d.donation_date BETWEEN ? AND ?
  `;

  db.query(query, [startDate, endDate], (err, results) => {
      if (err) {
          console.error("Error fetching donations by date:", err);
          return res.status(500).json({ message: "Database error" });
      }
      res.json(results);
  });
});

app.get("/user-distribution", async (req, res) => {
  try {
      const [studentsResult] = await db.promise().query("SELECT COUNT(*) as students FROM users WHERE role = 'student'");
      const [donorsResult] = await db.promise().query("SELECT COUNT(*) as donors FROM users WHERE role = 'donor'");

      res.json({
          students: studentsResult[0].students,
          donors: donorsResult[0].donors
      });
  } catch (error) {
      console.error("Error fetching user distribution:", error);
      res.status(500).json({ message: "Error fetching user distribution" });
  }
});

// Add these imports at the top of your server.js file
const crypto = require('crypto');

// Route to initiate password reset request
app.post("/forgot-password", async (req, res) => {
  const { username, email } = req.body;

  try {
    // Check if user exists
    const [userResults] = await db.promise().query(
      "SELECT * FROM users WHERE username = ? AND email = ?", 
      [username, email]
    );

    if (userResults.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate a unique reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Store reset token in database
    await db.promise().query(
      "UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE username = ? AND email = ?",
      [resetToken, resetTokenExpiry, username, email]
    );

    // Send email to admin about password reset request
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL, // You'll need to set this in your .env
      subject: "Password Reset Request",
      html: `
        <h2>Password Reset Request</h2>
        <p>A user has requested a password reset:</p>
        <ul>
          <li><strong>Username:</strong> ${username}</li>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Request Time:</strong> ${new Date().toLocaleString()}</li>
        </ul>
        <p>Please verify the user's identity and assist with password reset.</p>
      `
    };

    // Send email to admin
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending admin notification:", error);
        return res.status(500).json({ message: "Failed to send reset request" });
      }
      
      res.status(200).json({ 
        message: "Password reset request sent. An admin will assist you shortly." 
      });
    });

  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Route for admin to reset password
app.post("/admin/reset-password", authenticateToken, checkAdmin, async (req, res) => {
  const { username, newPassword } = req.body;

  try {
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password and clear reset token
    await db.promise().query(
      "UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE username = ?",
      [hashedPassword, username]
    );

    // Send confirmation email to user
    const [userResults] = await db.promise().query(
      "SELECT email FROM users WHERE username = ?", 
      [username]
    );

    if (userResults.length > 0) {
      const userEmail = userResults[0].email;
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: userEmail,
        subject: "Password Reset Confirmation",
        html: `
          <h2>Your Password Has Been Reset</h2>
          <p>Your password has been successfully reset by an administrator.</p>
          <p>If you did not request this change, please contact support immediately.</p>
        `
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error("Error sending password reset confirmation:", error);
        }
      });
    }

    res.status(200).json({ message: "Password reset successfully" });

  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});