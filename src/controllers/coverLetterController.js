const User = require('../models/Users');
const { generateCoverLetter } = require('../services/aiService');

const createCoverLetter = async (req, res) => {
  try {
    console.log('Creating personalized cover letter for user:', req.user.userId);
    
    // Fetch complete user profile
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { jobDescription } = req.body;
    
    if (!jobDescription || !jobDescription.trim()) {
      return res.status(400).json({ message: 'Job description is required' });
    }

    console.log('User profile loaded:', {
      name: user.name,
      email: user.email,
      hasPreferences: !!user.jobPreferences,
      hasResume: !!user.resumePath
    });

    // Generate cover letter using complete user profile
    const coverLetter = await generateCoverLetter({
      jobDescription: jobDescription.trim(),
      userProfile: {
        name: user.name,
        email: user.email,
        jobPreferences: user.jobPreferences || {},
        resumePath: user.resumePath
      }
    });

    console.log('Personalized cover letter generated successfully');
    
    // Optional: Save to database for history (you can implement this later)
    // await saveCoverLetterHistory(req.user.userId, jobDescription, coverLetter);
    
    res.json({ 
      coverLetter,
      message: 'Personalized cover letter generated successfully',
      profileUsed: {
        name: user.name,
        email: user.email,
        preferences: user.jobPreferences,
        hasResume: !!user.resumePath
      }
    });
    
  } catch (err) {
    console.error('Cover letter creation error:', err);
    res.status(500).json({ 
      message: err.message || 'Failed to generate cover letter',
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

module.exports = {
  createCoverLetter
}