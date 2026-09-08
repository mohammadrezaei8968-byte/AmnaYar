const express=require("express"), path=require("path");
const app=express(); app.use(express.json()); app.use(express.static(path.join(__dirname,"public")));
const PORT=process.env.PORT||8090;
app.get("/api/config",(req,res)=>res.json({name:"امنا یار",version:"5.10.0",apiBase:process.env.API_BASE||""}));
app.listen(PORT,()=>console.log("Admin UI on :"+PORT));
