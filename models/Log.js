import mongoose from "mongoose";

const logSchema = new mongoose.Schema({
  weedCount: { type: Number, required: true },
  weedsEliminated: { type: Number, required: true },
  successRate: { type: Number, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  original_image_url: { type: String, required: true },
  processed_image_url: { type: String, required: true },
},
{
    timestamps: true,
}
);
const Log = mongoose.model("Log", logSchema);
export default Log;
