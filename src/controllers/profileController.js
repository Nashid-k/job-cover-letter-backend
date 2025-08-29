const User = require("../models/Users");
const path = require("path");
const fs = require("fs");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const { parseResume } = require("../services/aiResumeParser");

// ---------------- CONTROLLERS ----------------
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json(user);
  } catch (err) {
    console.error("❌ getProfile error:", err.message);
    res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
};

const updatePreferences = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.userId);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const { title, location, skills = [], remote, email, name } = req.body;

    // Validate input
    if (skills && !Array.isArray(skills)) {
      return res.status(400).json({ success: false, message: "Skills must be an array" });
    }

    const updated = await User.findByIdAndUpdate(
      req.user.userId,
      {
        $set: {
          email: email || currentUser.email,
          name: name || currentUser.name,
          "jobPreferences.title": title || currentUser.jobPreferences?.title || "",
          "jobPreferences.location": location || currentUser.jobPreferences?.location || "",
          "jobPreferences.skills": skills.length ? skills : currentUser.jobPreferences?.skills || [],
          "jobPreferences.remote":
            typeof remote === "boolean" ? remote : currentUser.jobPreferences?.remote || false,
        },
      },
      { new: true, runValidators: true }
    ).select("-password");

    console.log("✅ Updated Preferences:\n", updated.jobPreferences);
    res.json({ success: true, user: updated });
  } catch (err) {
    console.error("❌ updatePreferences error:", err.message);
    res.status(500).json({ success: false, message: "Server error: " + err.message });
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
    const buffer = fs.readFileSync(filePath);

    let rawText = "";
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
      rawText = buffer.toString();
    } else {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(400).json({
        success: false,
        message: "Unsupported file type. Please upload PDF, Word document, or text file.",
      });
    }

    if (!rawText.trim() || rawText.length < 50) {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(400).json({
        success: false,
        message: "Unable to extract meaningful text from the file. Please try another file.",
      });
    }

    console.log("📄 Extracted Text Length:", rawText.length);

    // Parse with Universal AI Parser
    const parsed = await parseResume(rawText);
    console.log("📌 Parsed Resume Data - Skills:", parsed.jobPreferences?.skills?.length || 0);

    // Schema-safe update
    const update = {
      resumePath: req.file.path,
    };

    // Basic info
    if (parsed.name) update.name = parsed.name;
    if (parsed.email) update.email = parsed.email;

    // Job preferences - with fallbacks
    update.jobPreferences = {
      title: parsed.jobPreferences?.title || currentUser.jobPreferences?.title || "",
      location: parsed.jobPreferences?.location || currentUser.jobPreferences?.location || "",
      skills: Array.isArray(parsed.jobPreferences?.skills) ? parsed.jobPreferences.skills : [],
      remote:
        typeof parsed.jobPreferences?.remote === "boolean"
          ? parsed.jobPreferences.remote
          : currentUser.jobPreferences?.remote || false,
      preferredIndustries: parsed.jobPreferences?.preferredIndustries || [],
    };

    // Other sections - only update if we have data
    if (parsed.projects?.length) update.projects = parsed.projects;
    if (parsed.experience?.length) update.experience = parsed.experience;
    if (parsed.education?.length) update.education = parsed.education;
    if (parsed.certifications?.length) update.certifications = parsed.certifications;

    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: update },
      { new: true, runValidators: true, upsert: false }
    ).select("-password");

    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log("✅ Profile Saved Successfully. Skills extracted:", updatedUser.jobPreferences.skills.length);
    res.json({
      success: true,
      message: "Resume parsed & profile updated successfully. Please review extracted data as AI parsing may contain errors.",
      user: updatedUser,
    });
  } catch (err) {
    console.error("❌ uploadResume error:", err);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.status(500).json({
      success: false,
      message: "Server error: " + err.message,
    });
  }
};

module.exports = {
  getProfile,
  updatePreferences,
  uploadResume,
};