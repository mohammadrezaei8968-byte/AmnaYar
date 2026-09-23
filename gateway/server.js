const express=require("express");
const path=require("path");
const {createProxyMiddleware}=require("http-proxy-middleware");
const app=express();
const PORT=process.env.PORT||10000;
const API_TARGET=process.env.API_TARGET||"https://amnayar-api.onrender.com";
const WEB_DIR=path.resolve(__dirname,"../web");

app.use("/api",createProxyMiddleware({
  target:API_TARGET,
  changeOrigin:true,
  secure:true,
  pathRewrite:(p)=>"/api"+p
}));

app.use(express.static(WEB_DIR));

app.get("/owner",(req,res,next)=>{
  res.sendFile(path.join(WEB_DIR,"owner.html"),err=>{ if(err) next(); });
});

app.use((req,res,next)=>{
  if(req.path.includes(".")) return next();
  res.sendFile(path.join(WEB_DIR,"index.html"),err=>{ if(err) next(); });
});

app.use((req,res)=>res.status(404).send("Not Found"));

app.listen(PORT,"0.0.0.0",()=>console.log("AmnaYar gateway listening on "+PORT));