import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import FormData from 'form-data';
import fs from 'fs';
import axios from 'axios';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import User from './models/User.js';
import Log from './models/Log.js';
import { authenticateToken } from './middleware/auth.js';
import WaterLog from './models/WaterLog.js';

dotenv.config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configure multer for temp storage
const upload = multer({
  dest: 'uploads/', // will create a local `uploads/` directory
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

// Register
app.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: "User created successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: '1h'
    });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Log an operation (auth required)
// app.post('/logs', authenticateToken, async (req, res) => {
//   const { weedCount, weedsEliminated, successRate, original_image_url, processed_image_url } = req.body;
//   try {
//     const log = new Log({
//       weedCount,
//       weedsEliminated,
//       successRate,
//       user: req.user.userId,
//       original_image_url,
//       processed_image_url 
//     });
//     await log.save();
//     res.status(201).json(log);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });
// app.post('/logs', authenticateToken, upload.single('image'), async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ error: 'No image uploaded' });
//     }

//     const tempFilePath = req.file.path;

//     // Prepare multipart/form-data
//     const formData = new FormData();
//     formData.append('file', fs.createReadStream(tempFilePath));

//     // Call FastAPI
//     const fastapiRes = await axios.post(`${process.env.FASTAPI_URL}/detect/`, formData, {
//       headers: {
//         ...formData.getHeaders(),
//       },
//       maxContentLength: Infinity,
//       maxBodyLength: Infinity
//     });

//     const {
//       original_image_url,
//       processed_image_url,
//       weedCount,
//       weedsEliminated,
//       successRate
//     } = fastapiRes.data;

//     // Save log
//     const log = new Log({
//       user: req.user.userId,
//       original_image_url,
//       processed_image_url,
//       weedCount,
//       weedsEliminated,
//       successRate
//     });

//     await log.save();

//     // Clean up the uploaded file
//     fs.unlink(tempFilePath, err => {
//       if (err) console.error("Temp file cleanup error:", err);
//     });

//     res.status(201).json(log);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: err.message || 'Something went wrong' });
//   }
// });

app.post('/logs', authenticateToken, upload.single('image'), async (req, res) => {
  function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  log("Received request at /logs");

  try {
    if (!req.file) {
      log("No image uploaded");
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const tempFilePath = req.file.path;
    log(`Temp file path: ${tempFilePath}`);

    log("Preparing form data for FastAPI");
    const formData = new FormData();
    formData.append('file', fs.createReadStream(tempFilePath));

    log("Calling FastAPI /detect/ endpoint");
    const fastapiRes = await axios.post(`${process.env.FASTAPI_URL}/detect/`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    log("FastAPI response received");

    const {
      original_image_url,
      processed_image_url,
      weedCount,
      weedsEliminated,
      successRate
    } = fastapiRes.data;

    log("Saving log to database");
    const logEntry = new Log({
      user: req.user.userId,
      original_image_url,
      processed_image_url,
      weedCount,
      weedsEliminated,
      successRate
    });

    await logEntry.save();
    log("Log saved to database");

    fs.unlink(tempFilePath, err => {
      if (err) {
        console.error("Temp file cleanup error:", err);
      } else {
        log("Temp file cleaned up");
      }
    });

    res.status(201).json(logEntry);
  } catch (err) {
    console.error("Error in /logs endpoint:", err);
    res.status(500).json({ error: err.message || 'Something went wrong' });
  }
});
// Get user logs (auth required)
app.get('/logs', authenticateToken, async (req, res) => {
  try {
    const logs = await Log.find({ user: req.user.userId }).sort({ createdAt: -1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// CREATE Watering Log (auth required)
app.post('/water', authenticateToken, async (req, res) => {
  try {
    const response = await axios.post(`${process.env.FASTAPI_URL}/water/`);

    const success = response.data.success === true;

    const log = new WaterLog({
      user: req.user.userId,
      success
    });

    await log.save();
    res.status(201).json(log);
  } catch (err) {
    console.error("Water log error:", err.message);
    res.status(500).json({ error: "Watering failed" });
  }
});

// GET all water logs (auth required)
app.get('/water', authenticateToken, async (req, res) => {
  try {
    const logs = await WaterLog.find({ user: req.user.userId }).sort({ createdAt: -1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a specific water log
app.delete('/water/:id', authenticateToken, async (req, res) => {
  try {
    const log = await WaterLog.findOneAndDelete({
      _id: req.params.id,
      user: req.user.userId
    });
    if (!log) return res.status(404).json({ error: "Log not found" });
    res.json({ message: "Log deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
