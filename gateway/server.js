const express=require("express");
const path=require("path");
const {createProxyMiddleware}=require("http-proxy-middleware");
const app=express();
const PORT=process.env.PORT||10000;
const API_TARGET=process.env.API_TARGET||"https://amnayar-api.onrender.com";

app.use("/api",createProxyMiddleware({
  target:API_TARGET,
  changeOrigin:true,
  secure:true
}));

app.use(express.static(path.join(__dirname,"public")));

app.use((req,res)=>{
  res.sendFile(path.join(__dirname,"public","index.html"));
});

app.listen(PORT,"0.0.0.0",()=>console.log("AmnaYar gateway listening on "+PORT));