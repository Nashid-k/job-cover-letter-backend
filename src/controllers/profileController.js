const User = require("../models/Users");
const path = require("path");
const fs = require("fs");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const { parseResume } = require("../services/aiResumeParser");

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    res.json({ success: true, user });
  } catch (err) {
    console.error("Error in getProfile:", err.message);
    res.status(500).json({
      success: false,
      message: `Server error: ${err.message}`,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }
};

const updatePreferences = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const { title, location, skills, remote, email, name, preferredIndustries, salaryExpectations, phone, profession } = req.body;

    // Validate input
    if (skills && !Array.isArray(skills)) {
      return res.status(400).json({ success: false, message: "Skills must be an array" });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Invalid email format" });
    }

    if (name && (name.length < 2 || name.length > 100)) {
      return res.status(400).json({ success: false, message: "Name must be between 2 and 100 characters" });
    }

    if (phone && !/^(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}$/.test(phone)) {
      return res.status(400).json({ success: false, message: "Invalid phone format" });
    }

    const updateData = {
      email: email || currentUser.email,
      name: name || currentUser.name,
      phone: phone || currentUser.phone,
      profession: profession || currentUser.profession,
      jobPreferences: {
        title: typeof title === 'string' ? title.trim() : currentUser.jobPreferences?.title || "",
        location: typeof location === 'string' ? location.trim() : currentUser.jobPreferences?.location || "",
        skills: Array.isArray(skills)
          ? [...new Set(skills.filter(skill => typeof skill === 'string' && skill.trim().length > 2 && skill.trim().length < 50))]
          : currentUser.jobPreferences?.skills || [],
        remote: typeof remote === 'boolean' ? remote : currentUser.jobPreferences?.remote || false,
        preferredIndustries: Array.isArray(preferredIndustries)
          ? preferredIndustries.filter(ind => typeof ind === 'string' && ind.trim())
          : currentUser.jobPreferences?.preferredIndustries || [],
        salaryExpectations: typeof salaryExpectations === 'string' ? salaryExpectations.trim() : currentUser.jobPreferences?.salaryExpectations || "",
      },
    };

    const updated = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updated) {
      return res.status(500).json({ success: false, message: "Failed to update user preferences" });
    }

    res.json({
      success: true,
      user: updated,
      message: "Preferences updated successfully",
    });
    
  } catch (err) {
    console.error("Error in updatePreferences:", err.message);
    res.status(500).json({
      success: false,
      message: `Server error: ${err.message}`,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }
};

const uploadResume = async (req, res) => {
  let filePath = "";

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    filePath = path.resolve(req.file.path);

    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ success: false, message: "Uploaded file not found" });
    }

    const buffer = fs.readFileSync(filePath);
    let rawText = "";

    // Extract text based on file type
    try {
      if (req.file.mimetype === "application/pdf") {
        const data = await pdf(buffer);
        rawText = data.text || "";
      } else if (
        req.file.mimetype.includes("word") ||
        req.file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const data = await mammoth.extractRawText({ buffer });
        rawText = data.value || "";
      } else if (req.file.mimetype === "text/plain") {
        rawText = buffer.toString('utf8');
      } else {
        throw new Error("Unsupported file type");
      }
    } catch (extractionErr) {
      console.error("File extraction error:", extractionErr.message);
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(400).json({
        success: false,
        message: "Unable to extract text from file. Please ensure the file is not corrupted.",
      });
    }

    if (!rawText.trim() || rawText.length < 50) {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(400).json({
        success: false,
        message: "File appears to be empty or contains insufficient text for processing.",
      });
    }

    // Parse resume using AI service
    let parsed;
    try {
      parsed = await parseResume(rawText);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error("Invalid parsing result");
      }
    } catch (parseErr) {
      console.error("Resume parsing error:", parseErr.message);
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(500).json({
        success: false,
        message: "Failed to parse resume. Please try uploading a different file.",
        details: process.env.NODE_ENV === 'development' ? parseErr.message : undefined,
      });
    }

    // Prepare update data
    const updateData = {
      resumePath: req.file.path,
    };

    // Validate and set basic info
    if (parsed.name && typeof parsed.name === 'string' && parsed.name.trim() && parsed.name.length > 2 && parsed.name.length < 100 && !/full stack/i.test(parsed.name)) {
      updateData.name = parsed.name.trim();
    }

    if (parsed.email && typeof parsed.email === 'string') {
      const cleanEmail = parsed.email.split(/[|,]/)[0].trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        updateData.email = cleanEmail;
      }
    }

    if (parsed.phone && typeof parsed.phone === 'string' && /^(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}$/.test(parsed.phone.trim())) {
      updateData.phone = parsed.phone.trim();
    }

    if (parsed.profession && typeof parsed.profession === 'string' && parsed.profession.trim() && parsed.profession.length > 2 && parsed.profession.length < 100) {
      updateData.profession = parsed.profession.trim();
    }

    // Set job preferences
    updateData.jobPreferences = {
      title:
        parsed.jobPreferences?.title && typeof parsed.jobPreferences.title === 'string' && parsed.jobPreferences.title.length < 100 && !/full stack/i.test(parsed.jobPreferences.title)
          ? parsed.jobPreferences.title.trim()
          : currentUser.jobPreferences?.title || "",
      location:
        parsed.jobPreferences?.location && typeof parsed.jobPreferences.location === 'string' && parsed.jobPreferences.location.length < 100
          ? parsed.jobPreferences.location.trim()
          : currentUser.jobPreferences?.location || "",
      skills: Array.isArray(parsed.jobPreferences?.skills)
        ? [...new Set(parsed.jobPreferences.skills.filter(skill => typeof skill === 'string' && skill.trim().length > 2 && skill.trim().length < 50))]
        : currentUser.jobPreferences?.skills || [],
      remote: typeof parsed.jobPreferences?.remote === 'boolean' ? parsed.jobPreferences.remote : currentUser.jobPreferences?.remote || false,
      preferredIndustries: Array.isArray(parsed.jobPreferences?.preferredIndustries)
        ? parsed.jobPreferences.preferredIndustries.filter(ind => typeof ind === 'string' && ind.trim())
        : currentUser.jobPreferences?.preferredIndustries || [],
      salaryExpectations: currentUser.jobPreferences?.salaryExpectations || "",
    };

    // Set experience data
    if (Array.isArray(parsed.experience) && parsed.experience.length > 0) {
      updateData.experience = parsed.experience.map(exp => ({
        company: typeof exp.company === 'string' ? exp.company.trim() : "",
        position: typeof exp.position === 'string' ? exp.position.trim() : "",
        description: typeof exp.description === 'string' ? exp.description.trim() : "",
        startDate: typeof exp.startDate === 'string' ? exp.startDate.trim() : "",
        endDate: typeof exp.endDate === 'string' ? exp.endDate.trim() : "",
        current: typeof exp.current === 'boolean' ? exp.current : false,
        achievements: Array.isArray(exp.achievements) ? exp.achievements.filter(a => typeof a === 'string' && a.trim()) : [],
        skills: Array.isArray(exp.skills) ? exp.skills.filter(s => typeof s === 'string' && s.trim()) : [],
      }));
    }

    // Set education data
    if (Array.isArray(parsed.education) && parsed.education.length > 0) {
      updateData.education = parsed.education.map(edu => ({
        institution: typeof edu.institution === 'string' ? edu.institution.trim() : "",
        degree: typeof edu.degree === 'string' ? edu.degree.trim() : "",
        fieldOfStudy: typeof edu.fieldOfStudy === 'string' ? edu.fieldOfStudy.trim() : "",
        startDate: typeof edu.startDate === 'string' ? edu.startDate.trim() : "",
        endDate: typeof edu.endDate === 'string' ? edu.endDate.trim() : "",
        current: typeof edu.current === 'boolean' ? edu.current : false,
        description: typeof edu.description === 'string' ? edu.description.trim() : "",
      }));
    }

    // Set projects data
    if (Array.isArray(parsed.projects) && parsed.projects.length > 0) {
      updateData.projects = parsed.projects.map(proj => ({
        title: typeof proj.title === 'string' ? proj.title.trim() : "",
        description: typeof proj.description === 'string' ? proj.description.trim() : "",
        technologies: Array.isArray(proj.technologies) ? proj.technologies.filter(t => typeof t === 'string' && t.trim()) : [],
        startDate: typeof proj.startDate === 'string' ? proj.startDate.trim() : "",
        endDate: typeof proj.endDate === 'string' ? proj.endDate.trim() : "",
        current: typeof proj.current === 'boolean' ? proj.current : false,
        achievements: Array.isArray(proj.achievements) ? proj.achievements.filter(a => typeof a === 'string' && a.trim()) : [],
      }));
    }

    // Set certifications data
    if (Array.isArray(parsed.certifications) && parsed.certifications.length > 0) {
      updateData.certifications = parsed.certifications.map(cert => ({
        name: typeof cert.name === 'string' ? cert.name.trim() : "",
        issuer: typeof cert.issuer === 'string' ? cert.issuer.trim() : "",
        date: typeof cert.date === 'string' ? cert.date.trim() : "",
        expiryDate: typeof cert.expiryDate === 'string' ? cert.expiryDate.trim() : "",
      }));
    }

    // Update user in database
    let updatedUser;
    try {
      updatedUser = await User.findOneAndUpdate(
        { _id: req.user.userId, __v: currentUser.__v },
        { $set: updateData, $inc: { __v: 1 } },
        { new: true, runValidators: true, writeConcern: { w: 'majority' } }
      ).select("-password");

      if (!updatedUser) {
        throw new Error("Concurrent update detected or user document not found");
      }

      // Verify update
      const verification = await User.findById(req.user.userId).select("jobPreferences name email phone profession experience education projects certifications");
      if (!verification) {
        throw new Error("Failed to verify update in database");
      }

    } catch (updateErr) {
      console.error("Database update failed:", updateErr.message);
      if (updateErr.name === 'MongoServerError' && updateErr.code === 11000) {
        return res.status(400).json({
          success: false,
          message: "Email already exists in the database",
        });
      }
      throw new Error(`Failed to save profile data: ${updateErr.message}`);
    }

    res.json({
      success: true,
      message: `Resume processed successfully. Extracted ${updateData.jobPreferences.skills.length} skills. Please review the information for accuracy.`,
      user: updatedUser,
      stats: {
        skillsExtracted: updateData.jobPreferences.skills.length,
        profession: parsed.profession,
        hasValidEmail: !!updateData.email,
        hasValidName: !!updateData.name,
        hasValidPhone: !!updateData.phone,
        experienceExtracted: updateData.experience?.length || 0,
        educationExtracted: updateData.education?.length || 0,
        projectsExtracted: updateData.projects?.length || 0,
        certificationsExtracted: updateData.certifications?.length || 0,
      },
    });

    // Clean up temporary file
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (cleanupErr) {
      console.warn("Failed to clean up temporary file:", cleanupErr.message);
    }

  } catch (err) {
    console.error("Resume upload failed:", err.message);

    // Clean up file on error
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (cleanupErr) {
      console.warn("Failed to clean up file after error:", cleanupErr.message);
    }

    res.status(500).json({
      success: false,
      message: `Resume upload failed: ${err.message}`,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }
};

module.exports = {
  getProfile,
  updatePreferences,
  uploadResume,
};