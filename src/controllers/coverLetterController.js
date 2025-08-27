const User = require('../models/Users');
const { generateCoverLetter } = require('../services/aiService');

const createCoverLetter = async (req, res) => {
  try {
    console.log('Creating personalized cover letter for user:', req.user.userId);

    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { jobDescription, companyName, jobTitle } = req.body;
    if (!jobDescription || !jobDescription.trim()) {
      return res.status(400).json({ message: 'Job description is required' });
    }

    const coverLetter = await generateCoverLetter({
      jobDescription: jobDescription.trim(),
      userProfile: {
        name: user.name,
        email: user.email,
        jobPreferences: user.jobPreferences || {},
        resumePath: user.resumePath,
        projects: user.projects || [],
        experience: user.experience || []
      },
    });

    res.json({
      coverLetter,
      message: 'Cover letter generated successfully',
      profileUsed: {
        name: user.name,
        email: user.email,
        preferences: user.jobPreferences,
        projectsCount: user.projects?.length || 0,
        experienceCount: user.experience?.length || 0,
        hasResume: !!user.resumePath,
      },
    });
  } catch (err) {
    console.error('Cover letter creation error:', err);
    res.status(500).json({
      message: err.message || 'Failed to generate cover letter',
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }
};

module.exports = { createCoverLetter };