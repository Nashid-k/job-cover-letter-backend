const User = require('../models/Users');
const { generateCoverLetter } = require('../services/aiService');

const createCoverLetter = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { jobDescription, analysis } = req.body;

    if (!jobDescription?.trim()) {
      return res.status(400).json({ message: 'Job description is required' });
    }

    const result = await generateCoverLetter({
      jobDescription: jobDescription.trim(),
      userProfile: {
        name: user.name || 'Candidate',
        email: user.email || 'Not provided',
        profession: user.profession || 'Professional',
        jobPreferences: user.jobPreferences || {},
        resumePath: user.resumePath || '',
        projects: user.projects || [],
        experience: user.experience || [],
        education: user.education || [],
        certifications: user.certifications || []
      },
      analysis
    });

    res.json({
      coverLetter: result.coverLetter,
      analysis: result.analysis,
      recommendation: result.recommendation,
      message: 'Cover letter generated successfully',
      profileUsed: {
        name: user.name || 'Candidate',
        email: user.email || 'Not provided',
        profession: user.profession || 'Professional',
        preferences: user.jobPreferences || {},
        projectsCount: user.projects?.length || 0,
        experienceCount: user.experience?.length || 0,
        educationCount: user.education?.length || 0,
        certificationsCount: user.certifications?.length || 0,
        hasResume: !!user.resumePath
      }
    });
  } catch (err) {
    console.error('Cover letter creation error:', err.message);
    
    let errorMessage = 'Failed to generate cover letter';
    if (err.message.includes('token')) errorMessage = 'AI service configuration error';
    if (err.message.includes('timeout')) errorMessage = 'AI service timeout';
    
    res.status(500).json({
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

module.exports = { createCoverLetter };