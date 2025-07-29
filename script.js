const BASE_URL = "http://localhost:3000";

// Generic function to fetch data with error handling
async function fetchData(url, options = {}) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching data from ${url}:`, error);
    throw error;
  }
}

// Load campaigns dynamically
// Load campaigns dynamically
// Replace the existing loadCampaigns function with this enhanced version
async function loadCampaigns() {
  const campaignsContainer = document.getElementById("campaignsContainer");
  
  if (!campaignsContainer) return;
  
  // Get the selected category filter if exists
  const categoryFilter = document.getElementById("categoryFilter");
  const selectedCategory = categoryFilter ? categoryFilter.value : "All";
  
  try {
    campaignsContainer.innerHTML = '<p class="loading">Loading campaigns...</p>';
    
    const campaigns = await fetchData(`${BASE_URL}/campaigns`);
    
    // Filter campaigns by category if needed
    const filteredCampaigns = selectedCategory === "All" 
      ? campaigns 
      : campaigns.filter(campaign => campaign.category === selectedCategory);
    
    if (filteredCampaigns.length === 0) {
      campaignsContainer.innerHTML = '<p>No campaigns found in this category.</p>';
      return;
    }
    
    campaignsContainer.innerHTML = filteredCampaigns
      .map(
        (campaign) => {
          // Calculate progress percentage
          const progressPercent = Math.min(
            Math.round((campaign.raised_amount / campaign.goal_amount) * 100),
            100
          );
          
          return `
          <div class="campaign-card">
            <div class="campaign-header">
              <h3>${campaign.title}</h3>
              ${
                campaign.campaign_image
                  ? `<img src="${BASE_URL}/uploads/${campaign.campaign_image}" alt="Campaign Image" class="campaign-image">`
                  : `<div class="placeholder-image">No Image</div>`
              }
            </div>
            <div class="campaign-body">
              <p class="campaign-description">${campaign.description.substring(0, 150)}${campaign.description.length > 150 ? '...' : ''}</p>
              <div class="campaign-progress">
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${progressPercent}%"></div>
                </div>
                <p class="progress-text">${progressPercent}% funded</p>
              </div>
              <p class="campaign-stats">
                <span><strong>Goal:</strong> KES ${campaign.goal_amount.toLocaleString()}</span>
                <span><strong>Raised:</strong> KES ${campaign.raised_amount.toLocaleString()}</span>
              </p>
              <p class="campaign-creator"><strong>Created by:</strong> ${campaign.username}</p>
            </div>
            <div class="campaign-footer">
              <button class="toggle-donation-btn" onclick="toggleDonationForm(${campaign.id})">Donate Now</button>
              <div id="donation-form-${campaign.id}" class="donation-form-container hidden">
                <form class="donation-form" onsubmit="processDonation(event, ${campaign.id})">
                  <input type="text" name="donorName" placeholder="Your Name" required aria-label="Donor Name">
                  <input type="tel" name="phone" placeholder="Phone Number (M-Pesa)" required pattern="^[0-9]{10}$" aria-label="Phone Number">
                  <input type="number" name="amount" placeholder="Donation Amount (KES)" required min="1" aria-label="Donation Amount">
                  <button type="submit">Donate</button>
                </form>
              </div>
            </div>
          </div>
        `
      })
      .join("");
      
    // Add event listeners for category filter if exists
    if (categoryFilter) {
      categoryFilter.addEventListener("change", loadCampaigns);
    }
    
  } catch (error) {
    console.error("Error loading campaigns:", error);
    campaignsContainer.innerHTML = "<p>Failed to load campaigns. Please try again later.</p>";
  }
}

// Function to toggle donation form visibility
function toggleDonationForm(campaignId) {
  const formContainer = document.getElementById(`donation-form-${campaignId}`);
  formContainer.classList.toggle("hidden");
}

// Logout functionality
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  alert("You have been logged out.");
  window.location.href = "index.html";
}

// Load user projects
async function loadUserProjects() {
  const projectsContainer = document.getElementById("projectsContainer");
  if (!projectsContainer) return;
  
  const token = localStorage.getItem("token");
  if (!token) {
    projectsContainer.innerHTML = "<p>Please log in to view your projects.</p>";
    return;
  }
  
  try {
    projectsContainer.innerHTML = '<p class="loading">Loading your projects...</p>';
    
    const projects = await fetchData(`${BASE_URL}/user-projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (projects.length === 0) {
      projectsContainer.innerHTML = "<p>You have no active projects.</p>";
      return;
    }
    
    projectsContainer.innerHTML = projects
      .map(project => {
        // Calculate progress percentage
        const progressPercent = Math.min(
          Math.round((project.raised_amount / project.goal_amount) * 100),
          100
        );
        
        return `
        <div class="project-card">
          <h4>${project.title}</h4>
          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progressPercent}%"></div>
            </div>
            <p class="progress-text">${progressPercent}% funded</p>
          </div>
          <p>Goal: KES ${parseFloat(project.goal_amount).toLocaleString()} | Raised: KES ${parseFloat(project.raised_amount).toLocaleString()}</p>
          <p class="status-${project.status.toLowerCase()}">Status: ${project.status}</p>
          <p>Created: ${new Date(project.created_at || project.start_date).toLocaleDateString()}</p>
          ${project.campaign_image ? 
            `<img src="${BASE_URL}/uploads/${project.campaign_image}" alt="${project.title}" class="project-thumbnail">` : 
            '<div class="no-image">No image</div>'}
          <div class="project-actions">
            <button class="btn view-donations-btn" data-project-id="${project.project_id}" data-project-title="${project.title}">View Donations</button>
            <button class="btn edit-project-btn" data-project-id="${project.project_id}" data-project-title="${project.title}">Edit Project</button>
          </div>
        </div>
      `})
      .join("");
    
    // Add event listeners to the newly created View Donations buttons
    const viewDonationsButtons = projectsContainer.querySelectorAll(".view-donations-btn");
    viewDonationsButtons.forEach(button => {
      button.addEventListener("click", function() {
        const projectId = this.getAttribute("data-project-id");
        const projectTitle = this.getAttribute("data-project-title");
        createDonationsModal(projectId, projectTitle);
      });
    });
    
    // Add event listeners to the Edit Project buttons
    const editProjectButtons = projectsContainer.querySelectorAll(".edit-project-btn");
    editProjectButtons.forEach(button => {
      button.addEventListener("click", function() {
        const projectId = this.getAttribute("data-project-id");
        const projectTitle = this.getAttribute("data-project-title");
        createEditProjectModal(projectId, projectTitle);
      });
    });
    
  } catch (error) {
    console.error("Error loading user projects:", error);
    projectsContainer.innerHTML = "<p>Failed to load projects. Try again later.</p>";
  }
}
// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user"));

  // Only load user projects if the user is logged in
  if (token && user) {
    loadUserProjects();
  }

  // Load campaigns regardless of login status
  loadCampaigns();
});

function setupCampaignForm() {
  const toggleFormButton = document.getElementById("toggleCampaignForm");
  const campaignFormContainer = document.getElementById("campaignFormContainer");

  if (toggleFormButton && campaignFormContainer) {
    toggleFormButton.addEventListener("click", function () {
      campaignFormContainer.classList.toggle("visible");
    });
  }

  // Add event listener for form submission
  const campaignForm = document.getElementById("campaignForm");
  if (campaignForm) {
    campaignForm.addEventListener("submit", async function (event) {
      event.preventDefault(); // Prevent the default form submission

      const formData = new FormData(this); // Get form data

      // Get the token from localStorage
      const token = localStorage.getItem("token");

      try {
        const response = await fetch(`${BASE_URL}/create-campaign`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`, // Include the token in the headers
          },
          body: formData, // Send form data as FormData (for file uploads)
        });

        const result = await response.json();

        if (response.ok) {
          alert("Campaign created successfully!");
          window.location.reload(); // Reload the page to show the new campaign
        } else {
          alert(result.message || "Failed to create campaign. Please try again.");
        }
      } catch (error) {
        console.error("Error creating campaign:", error);
        alert("Campaign created.");
      }
    });
  }
}


// Call the function when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
  setupCampaignForm();
});

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
  const query = `SELECT d.id, d.donor_name, d.amount, p.title AS campaign_title FROM donations d JOIN projects p ON d.project_id = p.id`;
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

// Function to load donations for a specific project
// Replace the existing loadDonations function with this improved version
async function loadDonationsForProject(projectId) {
  const donationsList = document.getElementById("donations-list");

  try {
      const token = localStorage.getItem("token");
      if (!token) {
          donationsList.innerHTML = "<p>Please log in to view donations.</p>";
          return;
      }

      const response = await fetch(`${BASE_URL}/donations/${projectId}`, {
          headers: { "Authorization": `Bearer ${token}` }
      });

      if (!response.ok) {
          throw new Error(`Failed to fetch donations: ${response.status}`);
      }

      const donations = await response.json();

      if (!donations || donations.length === 0) {
          donationsList.innerHTML = "<p>No donations have been made to this project yet.</p>";
          return;
      }

      donationsList.innerHTML = `
        <table class="donations-table">
          <thead>
            <tr>
              <th>Donor</th>
              <th>Amount (KES)</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${donations.map(donation => `
              <tr>
                <td>${donation.donor_name}</td>
                <td>${parseFloat(donation.amount).toLocaleString()}</td>
                <td>${new Date(donation.donation_date).toLocaleDateString()}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
  } catch (error) {
      console.error("Error loading donations:", error);
      donationsList.innerHTML = "<p>Failed to load donations. Please try again later.</p>";
  }
}

// Function to handle the "View Donations" button click
function handleViewDonations(projectId) {
  loadDonations(projectId);
}


// Add event listeners to the "View Donations" and "Edit Project" buttons
document.addEventListener("DOMContentLoaded", () => {
  const viewDonationsButtons = document.querySelectorAll(".view-donations-btn");
  const editProjectButtons = document.querySelectorAll(".edit-project-btn");

  viewDonationsButtons.forEach(button => {
      button.addEventListener("click", () => {
          const projectId = button.getAttribute("data-project-id");
          handleViewDonations(projectId);
      });
  });

  editProjectButtons.forEach(button => {
      button.addEventListener("click", () => {
          const projectId = button.getAttribute("data-project-id");
          handleEditProject(projectId);
      });
  });
});

// Add this function to script.js
function createDonationsModal(projectId, projectTitle) {
  // Create modal container
  const modalContainer = document.createElement("div");
  modalContainer.classList.add("modal");
  modalContainer.id = "donations-modal";
  
  // Set modal content
  modalContainer.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>Donations for "${projectTitle}"</h3>
        <span class="close-modal">&times;</span>
      </div>
      <div class="modal-body">
        <div id="donations-list">
          <p class="loading">Loading donations...</p>
        </div>
      </div>
    </div>
  `;
  
  // Add modal to document
  document.body.appendChild(modalContainer);
  
  // Set up close button
  const closeButton = modalContainer.querySelector(".close-modal");
  closeButton.addEventListener("click", () => {
    document.body.removeChild(modalContainer);
  });
  
  // Also close when clicking outside the modal content
  modalContainer.addEventListener("click", (event) => {
    if (event.target === modalContainer) {
      document.body.removeChild(modalContainer);
    }
  });
  
  // Fetch and display donations
  loadDonationsForProject(projectId);
}

// Helper function to format dates for input fields
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toISOString().split('T')[0]; // Format: YYYY-MM-DD
}

// Call this function when the edit project page loads
document.addEventListener('DOMContentLoaded', function() {
  if (window.location.pathname.includes('edit_project.html')) {
    loadProjectForEditing();
    setupUpdateProjectForm();
  }
});

function setupUpdateProjectForm() {
  const updateForm = document.getElementById('update-project-form');
  
  if (updateForm) {
    updateForm.addEventListener('submit', async function(event) {
      event.preventDefault();
      
      const urlParams = new URLSearchParams(window.location.search);
      const projectId = urlParams.get('id');
      
      if (!projectId) {
        alert('No project ID specified');
        return;
      }
      
      const formData = new FormData(this);
      const token = localStorage.getItem('token');
      
      try {
        const response = await fetch(`${BASE_URL}/projects/${projectId}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        });
        
        if (!response.ok) {
          throw new Error(`Failed to update project: ${response.status}`);
        }
        
        const result = await response.json();
        alert('Project updated successfully!');
        window.location.href = 'dashboard.html';
        
      } catch (error) {
        console.error('Error updating project:', error);
        alert('Failed to update project. Please try again.');
      }
    });
  }
}

// Function to create and show the edit project modal
function createEditProjectModal(projectId, projectTitle) {
  // Get the token
  const token = localStorage.getItem("token");
  if (!token) {
    alert("Please log in to edit projects");
    return;
  }
  
  // Create modal container
  const modalContainer = document.createElement("div");
  modalContainer.classList.add("modal");
  modalContainer.id = "edit-project-modal";
  
  // Set initial modal content with loading message
  modalContainer.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>Edit Project: "${projectTitle}"</h3>
        <span class="close-modal">&times;</span>
      </div>
      <div class="modal-body">
        <p class="loading">Loading project details...</p>
      </div>
    </div>
  `;
  
  // Add modal to document
  document.body.appendChild(modalContainer);
  
  // Set up close button
  const closeButton = modalContainer.querySelector(".close-modal");
  closeButton.addEventListener("click", () => {
    document.body.removeChild(modalContainer);
  });
  
  // Also close when clicking outside the modal content
  modalContainer.addEventListener("click", (event) => {
    if (event.target === modalContainer) {
      document.body.removeChild(modalContainer);
    }
  });
  
  // Fetch project data and populate the form
  loadProjectDataForModal(projectId, modalContainer);
}

// Function to load project data and populate the edit form in the modal
async function loadProjectDataForModal(projectId, modalContainer) {
  const token = localStorage.getItem("token");
  
  try {
    const response = await fetch(`${BASE_URL}/campaigns/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch project: ${response.status}`);
    }
    
    const project = await response.json();
    
    // Create the edit form with project data
    const modalBody = modalContainer.querySelector(".modal-body");
    
    modalBody.innerHTML = `
      <form id="edit-project-form" class="project-edit-form">
        <div class="form-group">
          <label for="project-title">Campaign Title</label>
          <input type="text" id="project-title" name="title" value="${project.title || ''}" required>
        </div>
        
        <div class="form-group">
          <label for="project-description">Campaign Description</label>
          <textarea id="project-description" name="description" rows="4" required>${project.description || ''}</textarea>
        </div>
        
        <div class="form-group">
          <label for="goal-amount">Fundraising Goal (KES)</label>
          <input type="number" id="goal-amount" name="goal_amount" value="${project.goal_amount || ''}" required>
        </div>
        
        <div class="form-group">
          <label for="project-category">Campaign Category</label>
          <select id="project-category" name="category" required>
            <option value="Education" ${project.category === 'Education' ? 'selected' : ''}>Education</option>
            <option value="Health" ${project.category === 'Health' ? 'selected' : ''}>Health</option>
            <option value="Upkeep" ${project.category === 'Upkeep' ? 'selected' : ''}>Upkeep</option>
            <option value="Others" ${project.category === 'Others' ? 'selected' : ''}>Others</option>
          </select>
        </div>
        
        <div class="form-group">
          <label for="start-date">Start Date</label>
          <input type="date" id="start-date" name="start_date" value="${formatDate(project.start_date)}" required>
        </div>
        
        <div class="form-group">
          <label for="end-date">End Date</label>
          <input type="date" id="end-date" name="end_date" value="${formatDate(project.end_date)}" required>
        </div>
        
        <div class="form-group">
          <label for="campaign-image">Campaign Image</label>
          ${project.campaign_image ? 
            `<div class="current-image">
              <p>Current image:</p>
              <img src="${BASE_URL}/uploads/${project.campaign_image}" alt="Current project image" style="max-width: 200px; margin-bottom: 10px;">
            </div>` : ''}
          <input type="file" id="campaign-image" name="campaign_image" accept="image/*">
          <small>(Leave empty to keep current image)</small>
        </div>
        
        <div class="form-group">
          <label for="campaign-video">Campaign Video (URL)</label>
          <input type="url" id="campaign-video" name="campaign_video" value="${project.campaign_video || ''}">
        </div>
        
        <div class="form-group">
          <label for="beneficiaries">Beneficiaries</label>
          <textarea id="beneficiaries" name="beneficiaries" rows="3">${project.beneficiaries || ''}</textarea>
        </div>
        
        <div class="form-group">
          <label for="expected-impact">Expected Impact</label>
          <textarea id="expected-impact" name="expected_impact" rows="3">${project.expected_impact || ''}</textarea>
        </div>
        
        <div class="form-group">
          <label for="challenges">Challenges</label>
          <textarea id="challenges" name="challenges" rows="3">${project.challenges || ''}</textarea>
        </div>
        
        <button type="submit" class="btn">Update Project</button>
      </form>
    `;
    
    // Add event listener to the form
    const editForm = document.getElementById("edit-project-form");
    editForm.addEventListener("submit", (event) => handleProjectUpdate(event, projectId, modalContainer));
    
  } catch (error) {
    console.error("Error loading project:", error);
    modalContainer.querySelector(".modal-body").innerHTML = 
      "<p>Failed to load project data. Please try again later.</p>";
  }
}

// Function to handle project update submission
async function handleProjectUpdate(event, projectId, modalContainer) {
  event.preventDefault();
  
  const form = event.target;
  const formData = new FormData(form);
  const token = localStorage.getItem("token");
  
  // Show loading state
  form.innerHTML = '<p class="loading">Updating project...</p>';
  
  try {
    const response = await fetch(`${BASE_URL}/projects/${projectId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update project: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Show success message
    form.innerHTML = '<p class="success">Project updated successfully!</p>';
    
    // Close modal and reload projects after a brief delay
    setTimeout(() => {
      document.body.removeChild(modalContainer);
      loadUserProjects(); // Reload the projects list
    }, 1500);
    
  } catch (error) {
    console.error("Error updating project:", error);
    form.innerHTML = '<p class="error">Failed to update project. Please try again.</p>';
    
    // Add a button to try again
    const tryAgainBtn = document.createElement("button");
    tryAgainBtn.textContent = "Try Again";
    tryAgainBtn.classList.add("btn");
    tryAgainBtn.addEventListener("click", () => {
      // Reload the edit form
      loadProjectDataForModal(projectId, modalContainer);
    });
    form.appendChild(tryAgainBtn);
  }
}

// Helper function to format dates for input fields
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toISOString().split('T')[0]; // Format: YYYY-MM-DD
}
