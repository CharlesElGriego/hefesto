import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** Mongoose schema for the persisted chat transcript (web + WhatsApp). */
@Schema({ timestamps: true })
export class ChatMessage {
  @Prop({ required: true, enum: ['web', 'whatsapp'] })
  channel!: string;

  @Prop({ required: true, enum: ['user', 'assistant'] })
  role!: string;

  @Prop({ required: true })
  content!: string;

  @Prop({ type: Types.ObjectId, ref: 'MaintenanceRecord' })
  recordId?: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

/** Hydrated Mongoose document for ChatMessage. */
export type ChatMessageDocument = HydratedDocument<ChatMessage>;
export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);
