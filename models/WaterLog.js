import mongoose from "mongoose";

const waterLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  success: { type: Boolean, required: true }
}, {
  timestamps: true
});

const WaterLog = mongoose.model("WaterLog", waterLogSchema);
export default WaterLog;
