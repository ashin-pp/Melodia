const mongoose=require('mongoose');
require('dotenv').config();

const connectDB=async()=>{
    try{
        const connect=await mongoose.connect(process.env.MONGODB_URI,{
            useNewUrlParser: true,
            useUnifiedTopology: true,
        })
        console.log(`mongoDB connected ${connect.connection.host}`);
    }
    catch(err){
        console.log("mongoDb connection error", err )
    }
}

module.exports=connectDB;