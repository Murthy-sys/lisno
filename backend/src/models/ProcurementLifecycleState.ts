import { model, models, Schema } from "./mongoose.js";
const policy = new Schema({ timezone: {type:String,required:true}, reviewIntervalDays:{type:Number,required:true,min:1,max:7,validate:Number.isSafeInteger}, inspectionCount:{type:Number,required:true,enum:[2,3]} },{_id:false,strict:"throw"});
const schema=new Schema({ _id:{type:String,required:true,immutable:true}, projectId:{type:String,required:true,immutable:true},
  version:{type:Number,required:true,min:1,validate:Number.isSafeInteger}, activatedAt:{type:Date,required:true,immutable:true}, activatedById:{type:String,required:true,immutable:true},
  policy:{type:policy,required:true}, adoption:{type:String,enum:["new","existing"],required:true,immutable:true}, sourceDigest:{type:String,required:true},
  updatedAt:{type:Date,required:true}, updatedById:{type:String,required:true}
},{strict:"throw",versionKey:false});
schema.index({projectId:1},{unique:true});
export const ProcurementLifecycleStateModel=models.ProcurementLifecycleState??model("ProcurementLifecycleState",schema);
