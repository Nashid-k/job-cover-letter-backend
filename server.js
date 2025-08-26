const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');


dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const authRoute = require('./src/routes/auth');
app.use('/api/auth', authRoute);

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser:true,
    useUnifiedTopology:true,
}).then(()=>console.log('MongoDB connected')
).catch((err)=>console.error(err));


const PORT = process.env.PORT || 6000;
app.listen(PORT, ()=>console.log(`server is running on http://localhost:${PORT}`)
)