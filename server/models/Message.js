import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: { type: String },
    mediaUrl: { type: String },
    mediaType: { type: String }
  },
  { timestamps: true }
);

const Message = mongoose.model('Message', messageSchema);

export default Message;


