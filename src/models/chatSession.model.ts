import mongoose, { Document, Schema } from "mongoose";

export interface IChatSession extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

const chatSessionSchema = new Schema<IChatSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
  },
  {
    timestamps: true,
  }
);

chatSessionSchema.index({ userId: 1, createdAt: -1 });

const ChatSession = mongoose.model<IChatSession>("ChatSession", chatSessionSchema);

export default ChatSession;

