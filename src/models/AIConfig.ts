import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IAIConfig extends Document {
  businessId: mongoose.Types.ObjectId
  providers: {
    openai: {
      apiKey?: string
      isEnabled: boolean
      model: string
    }
    anthropic: {
      apiKey?: string
      isEnabled: boolean
      model: string
    }
    google: {
      apiKey?: string
      isEnabled: boolean
      model: string
    }
    stabilityai: {
      apiKey?: string
      isEnabled: boolean
    }
    openrouter: {
      apiKey?: string
      isEnabled: boolean
      model?: string
    }
  }
  defaultImageProvider: 'openai' | 'stabilityai'
  defaultTextProvider: 'openai' | 'anthropic' | 'google' | 'openrouter'
  updatedBy?: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const AIConfigSchema = new Schema<IAIConfig>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    providers: {
      openai: {
        apiKey: { type: String },
        isEnabled: { type: Boolean, default: false },
        model: { type: String, default: 'gpt-4o' },
      },
      anthropic: {
        apiKey: { type: String },
        isEnabled: { type: Boolean, default: false },
        model: { type: String, default: 'claude-3-5-sonnet-20241022' },
      },
      google: {
        apiKey: { type: String },
        isEnabled: { type: Boolean, default: false },
        model: { type: String, default: 'gemini-1.5-pro' },
      },
      stabilityai: {
        apiKey: { type: String },
        isEnabled: { type: Boolean, default: false },
      },
      openrouter: {
        apiKey: { type: String },
        isEnabled: { type: Boolean, default: false },
        model: { type: String },
      },
    },
    defaultImageProvider: {
      type: String,
      enum: ['openai', 'stabilityai'],
      default: 'openai',
    },
    defaultTextProvider: {
      type: String,
      enum: ['openai', 'anthropic', 'google', 'openrouter'],
      default: 'openai',
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
    },
  },
  {
    timestamps: true,
  }
)

const AIConfig: Model<IAIConfig> =
  mongoose.models.AIConfig ||
  mongoose.model<IAIConfig>('AIConfig', AIConfigSchema)

export default AIConfig
