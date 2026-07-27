import mongoose from "mongoose";

const GoodsReceiptItemSchema = new mongoose.Schema(
{
  goodsReceiptId:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"GoodsReceipt",
    required:true,
    index:true
  },

  materialId:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Material",
    required:true
  },

  materialCode:String,

  materialName:String,

  unit:String,

  orderedQuantity:{
    type:Number,
    default:0
  },

  receivedQuantity:{
    type:Number,
    default:0
  },

  acceptedQuantity:{
    type:Number,
    default:0
  },

  rejectedQuantity:{
    type:Number,
    default:0
  },

  unitRate:{
    type:Number,
    default:0
  },

  lineTotal:{
    type:Number,
    default:0
  },

  remarks:String

},
{
  timestamps:true
});

// goodsReceiptId already gets an index via `index:true` on its own field
// definition above -- this was an exact duplicate.

export default
mongoose.models.GoodsReceiptItem ||
mongoose.model(
"GoodsReceiptItem",
GoodsReceiptItemSchema
);
