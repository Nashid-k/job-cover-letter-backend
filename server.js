const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

app.use('/uploads', express.static('uploads'));

const authRoute = require('./src/routes/auth');
app.use('/api/auth', authRoute);

const profileRoutes = require('./src/routes/profile');
app.use('/api/profile', profileRoutes);

const coverLetterRoutes = require('./src/routes/coverLetter');
app.use('/api/coverletter', coverLetterRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 6000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));