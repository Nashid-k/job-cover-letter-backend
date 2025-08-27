const User = require('../models/Users');
const { generateCoverLetter } = require('../services/aiService');

const createCoverLetter = async (req, res) => {
  try {
    console.log('Creating personalized cover letter for user:', req.user.userId);

    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { jobDescription, analysis } = req.body;
    
    if (!jobDescription || !jobDescription.trim()) {
      return res.status(400).json({ message: 'Job description is required' });
    }

    // Generate cover letter with the enhanced service
    const result = await generateCoverLetter({
      jobDescription: jobDescription.trim(),
      userProfile: {
        name: user.name,
        email: user.email,
        jobPreferences: user.jobPreferences || {},
        resumePath: user.resumePath,
        projects: user.projects || [],
        experience: user.experience || []
      },
      analysis: analysis || null // Pass analysis if provided
    });

    // Return the enhanced response structure
    res.json({
      coverLetter: result.coverLetter,
      analysis: result.analysis,
      recommendation: result.recommendation,
      message: result.recommendation?.action === 'not_recommended' 
        ? 'Cover letter generation not recommended due to poor match' 
        : 'Cover letter generated successfully',
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
    
    // Provide more specific error messages
    let errorMessage = 'Failed to generate cover letter';
    if (err.message.includes('HF_TOKEN') || err.message.includes('token')) {
      errorMessage = 'AI service configuration error. Please check server settings.';
    } else if (err.message.includes('timeout')) {
      errorMessage = 'AI service timeout. Please try again.';
    }
    
    res.status(500).json({
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

module.exports = { createCoverLetter };
