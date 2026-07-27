import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITemplateVariable {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'select';
  options?: string[];
  required: boolean;
}

export interface IAgreementTemplate extends Document {
  type: string;
  name: string;
  description: string;
  content: string;
  variables: ITemplateVariable[];
  indianLawClauses: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TemplateVariableSchema = new Schema<ITemplateVariable>({
  key: { type: String, required: true },
  label: { type: String, required: true },
  type: { type: String, enum: ['text', 'date', 'number', 'select'], required: true },
  options: [{ type: String }],
  required: { type: Boolean, default: true },
}, { _id: false });

const AgreementTemplateSchema = new Schema<IAgreementTemplate>(
  {
    type: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    content: { type: String, required: true },
    variables: [TemplateVariableSchema],
    indianLawClauses: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const AgreementTemplate: Model<IAgreementTemplate> =
  mongoose.models.AgreementTemplate ||
  mongoose.model<IAgreementTemplate>('AgreementTemplate', AgreementTemplateSchema);

export default AgreementTemplate;
