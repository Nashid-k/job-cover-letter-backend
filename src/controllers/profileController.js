const User = require("../models/Users");
const path = require("path");
const fs = require("fs");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updatePreferences = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser)
      return res.status(404).json({ message: "User not found" });

    const { title, location, skills = [], remote, email, name } = req.body;

    const updated = await User.findByIdAndUpdate(
      req.user.userId,
      {
        jobPreferences: {
          title: title || currentUser.jobPreferences?.title || "",
          location: location || currentUser.jobPreferences?.location || "",
          skills: skills.length
            ? skills
            : currentUser.jobPreferences?.skills || [],
          remote:
            typeof remote === "boolean"
              ? remote
              : currentUser.jobPreferences?.remote || false,
        },
        email: email || currentUser.email,
        name: name || currentUser.name,
      },
      { new: true }
    ).select("-password");

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Enhanced technology/skill extraction function
const extractTechnologiesFromString = (text) => {
  if (!text) return [];

  // Comprehensive skill list for all job types
  const allSkills = [
    // Programming Languages
    "javascript",
    "typescript",
    "python",
    "java",
    "c++",
    "c#",
    "php",
    "ruby",
    "go",
    "rust",
    "swift",
    "kotlin",
    "scala",
    "r",
    "matlab",
    "perl",
    "dart",

    // Web Technologies
    "html",
    "css",
    "react",
    "vue",
    "angular",
    "svelte",
    "next.js",
    "nuxt.js",
    "node.js",
    "express",
    "django",
    "flask",
    "spring",
    "laravel",
    "rails",
    "asp.net",
    "fastapi",

    // Mobile Development
    "react native",
    "flutter",
    "xamarin",
    "ionic",
    "cordova",

    // Databases
    "mongodb",
    "postgresql",
    "mysql",
    "redis",
    "elasticsearch",
    "sql",
    "nosql",
    "oracle",
    "sqlite",
    "cassandra",
    "dynamodb",
    "firebase",

    // Cloud & DevOps
    "aws",
    "azure",
    "gcp",
    "docker",
    "kubernetes",
    "jenkins",
    "terraform",
    "ansible",
    "ci/cd",
    "linux",
    "unix",
    "bash",
    "shell",
    "git",
    "github",
    "gitlab",

    // Design & UI/UX
    "figma",
    "sketch",
    "adobe xd",
    "photoshop",
    "illustrator",
    "after effects",
    "premiere",
    "ui design",
    "ux design",
    "user experience",
    "user interface",

    // Data & Analytics
    "tableau",
    "power bi",
    "excel",
    "google analytics",
    "pandas",
    "numpy",
    "scipy",
    "matplotlib",
    "seaborn",
    "tensorflow",
    "pytorch",
    "scikit-learn",
    "spark",
    "hadoop",

    // Business & Management
    "project management",
    "agile",
    "scrum",
    "kanban",
    "waterfall",
    "lean",
    "six sigma",
    "pmp",
    "prince2",
    "jira",
    "confluence",
    "trello",
    "asana",

    // Marketing & Sales
    "seo",
    "sem",
    "google ads",
    "facebook ads",
    "linkedin ads",
    "content marketing",
    "email marketing",
    "social media marketing",
    "hubspot",
    "salesforce",
    "mailchimp",

    // Finance & Accounting
    "quickbooks",
    "sap",
    "oracle financials",
    "financial modeling",
    "budgeting",
    "forecasting",
    "accounts payable",
    "accounts receivable",

    // Industry-specific
    "autocad",
    "solidworks",
    "revit",
    "maya",
    "blender",
    "3ds max",
    "unity",
    "unreal engine",
    "ableton",
    "pro tools",
    "final cut pro",
  ];

  const textLower = text.toLowerCase();
  const foundSkills = [];

  // Check for each skill with flexible matching
  allSkills.forEach((skill) => {
    const skillVariations = [
      skill,
      skill.replace(/\./g, ""),
      skill.replace(/\s/g, ""),
      skill.replace(/\s/g, "-"),
      skill.replace(/-/g, " "),
      skill.replace(/-/g, ""),
    ];

    // Common abbreviations
    const abbreviations = {
      javascript: ["js"],
      typescript: ["ts"],
      "node.js": ["node", "nodejs"],
      react: ["reactjs"],
      vue: ["vuejs"],
      angular: ["angularjs"],
      postgresql: ["postgres"],
      mongodb: ["mongo"],
    };

    if (abbreviations[skill]) {
      skillVariations.push(...abbreviations[skill]);
    }

    // Check if any variation exists in the text
    if (
      skillVariations.some((variation) => {
        try {
          const regex = new RegExp(
            "\\b" + variation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b",
            "i"
          );
          return regex.test(textLower);
        } catch (e) {
          // Fallback to simple includes if regex fails
          return textLower.includes(variation.toLowerCase());
        }
      })
    ) {
      foundSkills.push(skill);
    }
  });

  return foundSkills;
};

// Enhanced project extraction with better pattern matching
const extractProjects = (text) => {
  const projects = [];
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const projectSectionRegex =
    /^(PROJECTS|PERSONAL PROJECTS|KEY PROJECTS|PORTFOLIO|ACADEMIC PROJECTS)$/i;
  let inProjectSection = false;
  let currentProject = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Start of projects section
    if (projectSectionRegex.test(line)) {
      inProjectSection = true;
      continue;
    }

    // End of projects section - fixed regex
    if (
      inProjectSection &&
      /^(EXPERIENCE|EDUCATION|SKILLS|CERTIFICATIONS|AWARDS|PUBLICATIONS)$/i.test(
        line
      )
    ) {
      inProjectSection = false;
      if (currentProject && currentProject.title) {
        projects.push(currentProject);
        currentProject = null;
      }
      continue;
    }

    if (inProjectSection && line) {
      // Detect project title - fixed regex
      const isProjectTitle =
        /^[A-Z][A-Za-z0-9\s\-&().]+$/.test(line) &&
        line.length > 3 &&
        line.length < 80 &&
        !/^https?:\/\/|^www\.|@/.test(line) &&
        !/^(developed|created|built|designed|implemented|used|worked|technologies|skills)/i.test(
          line
        ) &&
        !/^[•\-*\d+.]\s/.test(line);

      if (isProjectTitle) {
        // Save previous project
        if (currentProject && currentProject.title) {
          projects.push(currentProject);
        }

        // Start new project
        currentProject = {
          title: line,
          description: "",
          technologies: [],
          achievements: [],
        };
      } else if (currentProject) {
        // Check if line contains technologies (common patterns)
        const techIndicators =
          /technologies used|tech stack|built with|using|developed in|tools:/i;
        const isUrl = /^https?:\/\/|^www\./i.test(line);

        if (isUrl) {
          currentProject.link = line;
        } else if (techIndicators.test(line)) {
          // Extract technologies from this line
          const techString = line.replace(techIndicators, "").trim();
          const extractedTechs = extractTechnologiesFromString(techString);
          currentProject.technologies.push(...extractedTechs);
        } else if (
          line.startsWith("• ") ||
          line.startsWith("- ") ||
          line.startsWith("* ")
        ) {
          // Achievement or feature
          const achievement = line.replace(/^[•\-*]\s*/, "");
          if (achievement.length > 5) {
            currentProject.achievements.push(achievement);
            // Also extract technologies from achievements
            const techsFromAchievement =
              extractTechnologiesFromString(achievement);
            currentProject.technologies.push(...techsFromAchievement);
          }
        } else if (line.length > 10) {
          // Description line
          if (!currentProject.description) {
            currentProject.description = line;
          } else {
            currentProject.description += " " + line;
          }

          // Extract technologies from description
          const techsFromDesc = extractTechnologiesFromString(line);
          currentProject.technologies.push(...techsFromDesc);
        }
      }
    }
  }

  // Don't forget the last project
  if (currentProject && currentProject.title) {
    projects.push(currentProject);
  }

  // Clean up projects and remove duplicates from technologies
  return projects
    .map((project) => ({
      ...project,
      technologies: [...new Set(project.technologies)],
      description:
        project.description || "Project details available upon request",
    }))
    .slice(0, 8);
};

// Enhanced experience extraction
const extractExperience = (text) => {
  const experiences = [];
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const experienceSectionRegex =
    /^(EXPERIENCE|WORK EXPERIENCE|EMPLOYMENT HISTORY|PROFESSIONAL EXPERIENCE|CAREER HISTORY)$/i;
  let inExperienceSection = false;
  let currentExperience = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Start of experience section
    if (experienceSectionRegex.test(line)) {
      inExperienceSection = true;
      continue;
    }

    // End of experience section
    if (
      inExperienceSection &&
      /^(EDUCATION|PROJECTS|SKILLS|CERTIFICATIONS|AWARDS)$/i.test(line)
    ) {
      inExperienceSection = false;
      if (
        currentExperience &&
        (currentExperience.company || currentExperience.position)
      ) {
        experiences.push(currentExperience);
        currentExperience = null;
      }
      continue;
    }

    if (inExperienceSection && line) {
      // Try different patterns for company-position extraction
      let companyPositionMatch = null;

      // Pattern 1: Company - Position
      companyPositionMatch = line.match(/^(.+?)\s*[-–—]\s*(.+)$/);

      // Pattern 2: Position at Company
      if (!companyPositionMatch) {
        const atMatch = line.match(/^(.+?)\s+at\s+(.+)$/i);
        if (atMatch) {
          companyPositionMatch = [null, atMatch[2], atMatch[1]]; // Swap order
        }
      }

      // Pattern 3: Position | Company or Position, Company
      if (!companyPositionMatch) {
        const separatorMatch = line.match(/^(.+?)[\|,]\s*(.+)$/);
        if (
          separatorMatch &&
          separatorMatch[1].length < 50 &&
          separatorMatch[2].length < 50
        ) {
          const part1 = separatorMatch[1].trim();
          const part2 = separatorMatch[2].trim();
          const jobTitleWords = [
            "developer",
            "engineer",
            "manager",
            "analyst",
            "designer",
            "consultant",
            "specialist",
            "coordinator",
            "assistant",
            "intern",
          ];

          if (
            jobTitleWords.some((title) => part1.toLowerCase().includes(title))
          ) {
            companyPositionMatch = [null, part2, part1];
          } else {
            companyPositionMatch = [null, part1, part2];
          }
        }
      }

      if (companyPositionMatch) {
        // Save previous experience
        if (
          currentExperience &&
          (currentExperience.company || currentExperience.position)
        ) {
          experiences.push(currentExperience);
        }

        // Start new experience
        currentExperience = {
          company: companyPositionMatch[1]?.trim() || "",
          position: companyPositionMatch[2]?.trim() || "",
          description: "",
          achievements: [],
          skills: [],
        };
      } else if (currentExperience) {
        // Handle dates (skip for now but could be enhanced)
        if (
          /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4}|present|current)/i.test(
            line
          ) &&
          line.length < 50
        ) {
          continue;
        }

        // Handle bullet points or achievements
        if (line.match(/^[•\-*]\s/) || line.match(/^\d+\.\s/)) {
          const achievement = line.replace(/^[•\-*\d+.\s]+/, "").trim();
          if (achievement.length > 5) {
            currentExperience.achievements.push(achievement);

            // Extract skills from achievements
            const skillsFromAchievement =
              extractTechnologiesFromString(achievement);
            currentExperience.skills.push(...skillsFromAchievement);
          }
        } else if (line.length > 10 && !line.match(/^\s*$/)) {
          // Description line
          if (!currentExperience.description) {
            currentExperience.description = line;
          } else {
            currentExperience.description += " " + line;
          }

          // Extract skills from description
          const skillsFromDesc = extractTechnologiesFromString(line);
          currentExperience.skills.push(...skillsFromDesc);
        }
      }
    }
  }

  // Don't forget the last experience
  if (
    currentExperience &&
    (currentExperience.company || currentExperience.position)
  ) {
    experiences.push(currentExperience);
  }

  // Clean up experiences
  return experiences
    .map((exp) => ({
      ...exp,
      skills: [...new Set(exp.skills)],
      description:
        exp.description ||
        exp.achievements.join("; ") ||
        "Professional experience details available upon request",
    }))
    .slice(0, 5);
};

// Enhanced email extraction
const extractEmail = (text) => {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}/g;
  const matches = text.match(emailRegex);
  return matches ? matches[0] : "";
};

// Enhanced name extraction
const extractName = (text) => {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Try to extract from LinkedIn or GitHub URLs first
  const linkedInMatch = text.match(/linkedin\.com\/in\/([a-zA-Z0-9-]+)/i);

  if (linkedInMatch && linkedInMatch[1]) {
    const username = linkedInMatch[1];
    const nameFromUrl = username
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

    if (nameFromUrl.split(" ").length >= 2 && nameFromUrl.length > 5) {
      return nameFromUrl;
    }
  }

  // Look for name in first few lines
  for (let i = 0; i < Math.min(8, lines.length); i++) {
    const line = lines[i];

    // Skip lines with obvious non-name content
    const skipIndicators = [
      "@",
      "http",
      "phone",
      "linkedin",
      "github",
      "summary",
      "experience",
      "education",
      "skills",
      "technical",
      "projects",
      "certifications",
      "achievements",
      "objective",
      "resume",
      "cv",
      "portfolio",
      "contact",
      "address",
      "mobile",
      "tel:",
      "email:",
      "+",
      "•",
      "|",
      "-",
      "street",
      "city",
      "state",
      "zip",
    ];

    const lowerLine = line.toLowerCase();
    if (skipIndicators.some((indicator) => lowerLine.includes(indicator))) {
      continue;
    }

    // Check if line looks like a name
    const nameParts = line.split(" ").filter((part) => part.length > 0);
    const isLikelyName =
      nameParts.length >= 2 &&
      nameParts.length <= 4 &&
      nameParts.every((part) => part.length > 1) &&
      /^[A-Za-zÀ-ÿ\-.' ]+$/.test(line) &&
      nameParts.every(
        (part) => /^[A-Z][a-z]*\.?$/.test(part) || /^[A-Z]\.?$/.test(part)
      ) &&
      line.length > 3 &&
      line.length < 50;

    if (isLikelyName) {
      return line;
    }
  }

  return "";
};

// Enhanced skills extraction
const extractSkills = (text) => {
  if (!text) return [];

  const lowerText = text.toLowerCase();
  let skillsSection = "";

  // Find skills section
  const sectionHeaders = [
    "technical skills",
    "skills",
    "technologies",
    "expertise",
    "technical expertise",
    "core competencies",
    "proficiencies",
    "tools and technologies",
    "technical competencies",
  ];

  for (const header of sectionHeaders) {
    const regex = new RegExp(
      header +
        "[\\s\\S]*?(?=" +
        sectionHeaders.join("|") +
        "|experience|education|projects|certifications|$|\\n\\n)",
      "i"
    );
    const match = text.match(regex);
    if (match) {
      skillsSection = match[0];
      break;
    }
  }

  // Extract from skills section and entire text
  const searchText = skillsSection || text;
  const extractedSkills = extractTechnologiesFromString(searchText);

  // Also look for skills in bullet points throughout the document
  const bulletPointRegex = /[•\-*]\s*([^\n\r]+)/g;
  let match;
  while ((match = bulletPointRegex.exec(text)) !== null) {
    const bulletText = match[1];
    const skillsFromBullet = extractTechnologiesFromString(bulletText);
    extractedSkills.push(...skillsFromBullet);
  }

  // Remove duplicates and return
  return [...new Set(extractedSkills)].slice(0, 20);
};

// Enhanced title extraction
const extractTitle = (text) => {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const sectionHeaders = [
    "professional summary",
    "summary",
    "experience",
    "work experience",
    "education",
    "skills",
    "technical skills",
    "projects",
    "certifications",
    "achievements",
    "contact",
    "references",
    "key projects",
    "objective",
  ];

  // Look for title in first several lines
  for (let i = 1; i < Math.min(12, lines.length); i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    // Skip section headers
    if (sectionHeaders.some((header) => lowerLine.includes(header))) {
      continue;
    }

    // Skip contact information
    const contactIndicators = [
      "@",
      "http",
      "phone",
      "linkedin",
      "github",
      "portfolio",
      "+",
      "•",
      "-",
      "|",
      "street",
      "city",
    ];
    if (contactIndicators.some((indicator) => line.includes(indicator))) {
      continue;
    }

    // Look for job title patterns
    const titlePatterns = [
      "developer",
      "engineer",
      "designer",
      "specialist",
      "analyst",
      "architect",
      "manager",
      "consultant",
      "programmer",
      "administrator",
      "coordinator",
      "assistant",
      "director",
      "lead",
      "senior",
      "junior",
      "intern",
      "associate",
      "executive",
      "officer",
      "representative",
      "technician",
      "scientist",
      "researcher",
      "writer",
      "editor",
      "marketing",
      "sales",
      "finance",
      "accounting",
      "hr",
      "legal",
    ];

    const hasTitlePattern = titlePatterns.some((pattern) =>
      lowerLine.includes(pattern)
    );

    // Check if it looks like a professional title
    if (line && line.length > 5 && line.length < 100 && hasTitlePattern) {
      return line;
    }

    // Also check for common title formats without specific keywords
    if (
      line &&
      line.length > 10 &&
      line.length < 80 &&
      /^[A-Z][A-Za-z\s&\-\/().,]+$/.test(line) &&
      !line.includes("University") &&
      !line.includes("College")
    ) {
      // Additional validation - should have some professional words
      const professionalWords = [
        "professional",
        "specialist",
        "expert",
        "experienced",
        "skilled",
      ];
      if (professionalWords.some((word) => lowerLine.includes(word))) {
        return line;
      }
    }
  }

  return "";
};

// Main upload function
const uploadResume = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const currentUser = await User.findById(req.user.userId);
    if (!currentUser)
      return res.status(404).json({ message: "User not found" });

    const fileBuffer = fs.readFileSync(path.resolve(req.file.path));
    let rawText = "";

    if (req.file.mimetype === "application/pdf") {
      const data = await pdf(fileBuffer);
      rawText = data.text;
    } else if (
      req.file.mimetype === "application/msword" ||
      req.file.mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      rawText = result.value;
    } else {
      return res
        .status(400)
        .json({
          message: "Invalid file type. Please upload PDF or Word document.",
        });
    }

    // Enhanced extraction
    const email = extractEmail(rawText);
    const name = extractName(rawText);
    const skills = extractSkills(rawText);
    const title = extractTitle(rawText);
    const projects = extractProjects(rawText);
    const experience = extractExperience(rawText);

    // Update user with comprehensive data
    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId,
      {
        resumePath: req.file.path,
        jobPreferences: {
          title: title || currentUser.jobPreferences?.title || "",
          location: currentUser.jobPreferences?.location || "",
          skills:
            skills.length > 0
              ? skills
              : currentUser.jobPreferences?.skills || [],
          remote: currentUser.jobPreferences?.remote || false,
          salaryExpectations:
            currentUser.jobPreferences?.salaryExpectations || "",
          preferredIndustries:
            currentUser.jobPreferences?.preferredIndustries || [],
        },
        email: email || currentUser.email,
        name: name || currentUser.name,
        projects: projects.length > 0 ? projects : currentUser.projects || [],
        experience:
          experience.length > 0 ? experience : currentUser.experience || [],
      },
      { new: true }
    ).select("-password");

    // Clean up uploaded file
    try {
      fs.unlinkSync(path.resolve(req.file.path));
    } catch (cleanupError) {
      console.warn("Could not delete uploaded file:", cleanupError.message);
    }

    res.json({
      ...updatedUser.toObject(),
      message: "Resume uploaded and parsed successfully",
      parsed: {
        title: title || "Not found",
        skills: skills || [],
        email: email || "Not found",
        name: name || "Not found",
        projects: projects.length,
        experience: experience.length,
        totalSkillsExtracted: skills.length,
      },
    });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
      // Duplicate email error
      res.status(400).json({
        message:
          "The email address in your resume doesn't match your account email. Please upload a resume with your current email address or update your account email in profile settings.",
      });
    } else {
      console.error("Upload error:", error.message);
      res.status(500).json({
        message:
          "Failed to process resume. Please ensure the file is readable and try again.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
};

module.exports = {
  getProfile,
  updatePreferences,
  uploadResume,
};
