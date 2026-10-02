const express=require("express");
const path=require("path");
const crypto=require("crypto");
const fs=require("fs");
const os=require("os");
const util=require("util");
const {execFile}=require("child_process");
const multer=require("multer");
const {createProxyMiddleware}=require("http-proxy-middleware");

const app=express();
const PORT=process.env.PORT||10000;
const API_TARGET=process.env.API_TARGET||"https://amnayar-api.onrender.com";
const WEB_DIR=path.resolve(__dirname,"../web");
const execFileAsync=util.promisify(execFile);

// PDF compression is handled here because Ghostscript is installed on this Gateway.
// This keeps large PDF jobs independent from the API service's runtime packages.
const pdfUpload=multer({
  dest:os.tmpdir(),
  limits:{fileSize:500*1024*1024},
  fileFilter:(req,file,cb)=>cb(null,file.mimetype==="application/pdf"||/\.pdf$/i.test(file.originalname))
});

app.post("/api/tools/compress-pdf",pdfUpload.single("file"),async(req,res)=>{
  const input=req.file?.path;
  if(!input)return res.status(400).json({error:"pdf_required"});

  const quality=Math.max(35,Math.min(85,Number(req.body?.quality||70)));
  const output=path.join(os.tmpdir(),"amnayar-compressed-"+crypto.randomUUID()+".pdf");
  const settings=quality<=40?"/screen":quality<=60?"/ebook":quality<=75?"/printer":"/prepress";

  try{
    const imageDpi=quality<=40?60:quality<=60?85:quality<=75?120:170;
    const jpegQ=quality<=40?40:quality<=60?55:quality<=75?70:84;
    await execFileAsync("gs",[
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      "-dSAFER",
      "-dDetectDuplicateImages=true",
      "-dCompressFonts=true",
      "-dSubsetFonts=true",
      "-dAutoRotatePages=/None",
      "-dColorImageDownsampleType=/Average",
      "-dGrayImageDownsampleType=/Average",
      "-dMonoImageDownsampleType=/Subsample",
      "-dColorImageResolution="+imageDpi,
      "-dGrayImageResolution="+imageDpi,
      "-dMonoImageResolution="+Math.max(150,imageDpi*2),
      "-dJPEGQ="+jpegQ,
      "-dPDFSETTINGS="+settings,
      "-sOutputFile="+output,
      input
    ],{
      timeout:35*60*1000,
      maxBuffer:4*1024*1024
    });

    const stat=await fs.promises.stat(output);
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition",'attachment; filename="amnayar-compressed.pdf"');
    res.setHeader("X-Original-Size",String(req.file.size));
    res.setHeader("X-Compressed-Size",String(stat.size));

    res.sendFile(output,err=>{
      Promise.allSettled([
        fs.promises.unlink(input),
        fs.promises.unlink(output)
      ]).catch(()=>{});
      if(err&&!res.headersSent)res.status(500).json({error:"pdf_send_failed"});
    });
  }catch(e){
    Promise.allSettled([
      fs.promises.unlink(input),
      fs.promises.unlink(output)
    ]).catch(()=>{});

    const msg=String(e?.stderr||e?.message||"");
    console.error("pdf_compress_failed",msg.slice(0,1500));

    if(/ENOENT/i.test(msg))return res.status(503).json({error:"ghostscript_unavailable"});
    if(/LIMIT_FILE_SIZE|too large|File too large/i.test(msg))return res.status(413).json({error:"pdf_too_large"});
    return res.status(422).json({error:"pdf_compress_failed"});
  }
});

// Other API traffic continues to the backend.
app.get("/health",(req,res)=>res.json({ok:true,service:"amnayar-gateway"}));

app.use("/api",createProxyMiddleware({
  target:API_TARGET,
  changeOrigin:true,
  secure:true,
  pathRewrite:(p)=>"/api"+p
}));

app.use(express.static(WEB_DIR));

app.get("/admin",(req,res)=>res.redirect(302,"/owner"));

app.get("/owner",(req,res,next)=>{
  res.sendFile(path.join(WEB_DIR,"owner.html"),err=>{if(err)next();});
});

app.use((req,res,next)=>{
  if(req.path.includes("."))return next();
  res.sendFile(path.join(WEB_DIR,"index.html"),err=>{if(err)next();});
});

app.use((req,res)=>res.status(404).send("Not Found"));

const server=app.listen(PORT,"0.0.0.0",()=>console.log("AmnaYar gateway listening on "+PORT));
server.requestTimeout=35*60*1000;
server.headersTimeout=120*1000;
server.keepAliveTimeout=120*1000;
