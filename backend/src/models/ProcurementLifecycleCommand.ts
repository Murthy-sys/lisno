import { model, models, Schema } from "./mongoose.js";
const schema=new Schema({ _id:{type:String,required:true,immutable:true}, projectId:{type:String,required:true,immutable:true}, actorId:{type:String,required:true,immutable:true}, actorName:{type:String,required:true,immutable:true},
  action:{type:String,required:true,immutable:true}, entityId:{type:String,required:true,immutable:true}, idempotencyKey:{type:String,required:true,immutable:true}, digest:{type:String,required:true,immutable:true},
  result:{type:Schema.Types.Mixed,required:true,immutable:true}, reason:{type:String,default:null,immutable:true}, occurredAt:{type:Date,required:true,immutable:true}
},{strict:"throw",versionKey:false});
schema.index({projectId:1,actorId:1,idempotencyKey:1},{unique:true}); schema.index({projectId:1,entityId:1,occurredAt:-1,_id:1});
export const ProcurementLifecycleCommandModel=models.ProcurementLifecycleCommand??model("ProcurementLifecycleCommand",schema);
