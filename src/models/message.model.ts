import mongoose, { Document, Schema } from "mongoose";

export interface IMessage extends Document {
  chat_session_id: mongoose.Types.ObjectId;
  is_user_message: boolean;
  message: string;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    chat_session_id: {
      type: Schema.Types.ObjectId,
      ref: "ChatSession",
      required: [true, "Chat session ID is required"],
      index: true,
    },
    is_user_message: {
      type: Boolean,
      required: [true, "is_user_message field is required"],
      default: false,
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ chat_session_id: 1, createdAt: 1 });

const Message = mongoose.model<IMessage>("Message", messageSchema);

export default Message;

