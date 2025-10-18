import mongoose, { Document, Schema } from "mongoose";

export interface ISessionContext extends Document {
  chat_session_id: mongoose.Types.ObjectId;
  contextData: Map<string, any>;
  conversationSummary?: string;
  createdAt: Date;
  updatedAt: Date;
}

const sessionContextSchema = new Schema<ISessionContext>(
  {
    chat_session_id: {
      type: Schema.Types.ObjectId,
      ref: "ChatSession",
      required: true,
      unique: true,
      index: true,
    },
    contextData: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
    conversationSummary: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

const SessionContext = mongoose.model<ISessionContext>("SessionContext", sessionContextSchema);

export default SessionContext;

