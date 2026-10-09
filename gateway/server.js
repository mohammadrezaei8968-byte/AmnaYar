const express=require("express");
const path=require("path");
const crypto=require("crypto");
const fs=require("fs");
const os=require("os");
const util=require("util");
const {execFile}=require("child_process");
const ffmpegPath=require("ffmpeg-static");
const multer=require("multer");
const compression=require("compression");
const {createProxyMiddleware}=require("http-proxy-middleware");

const app=express();
const PORT=process.env.PORT||10000;
const API_TARGET=process.env.API_TARGET||"https://amnayar-api.onrender.com";
const WEB_DIR=path.resolve(__dirname,"../web");
const execFileAsync=util.promisify(execFile);

// Performance: gzip/brotli compress HTML, CSS and JS before sending to browsers.
app.use(compression({threshold:1024}));

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

  const quality=Math.max(25,Math.min(75,Number(req.body?.quality||55)));
  const output=path.join(os.tmpdir(),"amnayar-compressed-"+crypto.randomUUID()+".pdf");
  const settings=quality<=45?"/screen":quality<=65?"/ebook":"/ebook";

  const cleanup=async()=>Promise.allSettled([
    fs.promises.unlink(input),
    fs.promises.unlink(output)
  ]);

  const runGs=async(out,level)=>{
    const imageDpi=level<=20?45:level<=30?55:level<=45?72:level<=60?90:120;
    const jpegQ=level<=20?20:level<=30?28:level<=45?40:level<=60?50:60;
    const preset=level<=45?"/screen":"/ebook";
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
      "-dDownsampleColorImages=true",
      "-dDownsampleGrayImages=true",
      "-dDownsampleMonoImages=true",
      "-dColorImageDownsampleType=/Average",
      "-dGrayImageDownsampleType=/Average",
      "-dMonoImageDownsampleType=/Subsample",
      "-dColorImageResolution="+imageDpi,
      "-dGrayImageResolution="+imageDpi,
      "-dMonoImageResolution="+Math.max(150,imageDpi*2),
      "-dColorImageDownsampleThreshold=1.0",
      "-dGrayImageDownsampleThreshold=1.0",
      "-dMonoImageDownsampleThreshold=1.0",
      "-dAutoFilterColorImages=false",
      "-dAutoFilterGrayImages=false",
      "-dColorImageFilter=/DCTEncode",
      "-dGrayImageFilter=/DCTEncode",
      "-dPassThroughJPEGImages=false",
      "-dPassThroughJPXImages=false",
      "-dJPEGQ="+jpegQ,
      "-dPDFSETTINGS="+preset,
      "-sOutputFile="+out,
      input
    ],{timeout:45*60*1000,maxBuffer:4*1024*1024});
  };

  try{
    let stat;
    // Try progressively stronger image downsampling if the selected profile does not shrink the file.
    const profiles=[...new Set([quality,30,20])];
    for(const profile of profiles){
      await fs.promises.unlink(output).catch(()=>{});
      await runGs(output,profile);
      stat=await fs.promises.stat(output);
      if(stat.size<req.file.size)break;
    }

    const useOriginal=stat.size>=req.file.size;
    const filePath=useOriginal?input:output;
    const finalSize=useOriginal?req.file.size:stat.size;

    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition",'attachment; filename="amnayar-compressed.pdf"');
    res.setHeader("X-Original-Size",String(req.file.size));
    res.setHeader("X-Compressed-Size",String(finalSize));
    res.setHeader("X-Compression-Applied",useOriginal?"no":"yes");

    res.sendFile(filePath,err=>{
      Promise.allSettled([
        fs.promises.unlink(input),
        fs.promises.unlink(output)
      ]).catch(()=>{});
      if(err&&!res.headersSent)res.status(500).json({error:"pdf_send_failed"});
    });
  }catch(e){
    await cleanup();
    const msg=String(e?.stderr||e?.message||"");
    console.error("pdf_compress_failed",msg.slice(0,1500));
    if(/ENOENT/i.test(msg))return res.status(503).json({error:"ghostscript_unavailable"});
    if(/LIMIT_FILE_SIZE|too large|File too large/i.test(msg))return res.status(413).json({error:"pdf_too_large"});
    if(/password|encrypted|invalid|syntax|error/i.test(msg))return res.status(422).json({error:"pdf_compress_failed"});
    return res.status(422).json({error:"pdf_compress_failed"});
  }
});

// Video processing is also handled here so the large upload stays off the API service.
// Large video compression on the gateway using FFmpeg. Uploads are streamed to a temporary file.
const videoUpload=multer({
  dest:os.tmpdir(),
  limits:{fileSize:2*1024*1024*1024},
  fileFilter:(req,file,cb)=>{
    const allowed=/\.(mp4|mov|m4v|mkv|webm|avi|3gp)$/i.test(file.originalname||"");
    cb(null,String(file.mimetype||"").startsWith("video/")||allowed);
  }
});
app.post("/api/tools/compress-video",videoUpload.single("file"),async(req,res)=>{
  const input=req.file?.path;
  if(!input)return res.status(400).json({error:"video_required"});
  const quality=String(req.body?.quality||"balanced");
  const crf=quality==="small"?35:quality==="high"?27:32;
  const output=path.join(os.tmpdir(),"amnayar-video-"+crypto.randomUUID()+".mp4");
  const cleanup=()=>Promise.allSettled([fs.promises.unlink(input),fs.promises.unlink(output)]);
  try{
    if(!ffmpegPath)return res.status(503).json({error:"ffmpeg_unavailable"});
    await execFileAsync(ffmpegPath,[
      "-hide_banner","-loglevel","error","-y","-i",input,
      "-map","0:v:0","-map","0:a?","-vf","scale='min(960,iw)':-2:flags=fast_bilinear",
      "-c:v","libx264","-preset","ultrafast","-crf",String(crf),
      "-c:a","aac","-b:a","96k","-movflags","+faststart","-threads","0",output
    ],{timeout:2*60*60*1000,maxBuffer:4*1024*1024});
    const stat=await fs.promises.stat(output);
    const useOriginal=stat.size>=req.file.size;
    const filePath=useOriginal?input:output;
    const finalSize=useOriginal?req.file.size:stat.size;
    res.setHeader("Content-Type","video/mp4");
    res.setHeader("Content-Disposition",'attachment; filename="amnayar-compressed.mp4"');
    res.setHeader("X-Original-Size",String(req.file.size));
    res.setHeader("X-Compressed-Size",String(finalSize));
    res.setHeader("X-Compression-Applied",useOriginal?"no":"yes");
    res.sendFile(filePath,err=>{
      cleanup().catch(()=>{});
      if(err&&!res.headersSent)res.status(500).json({error:"video_send_failed"});
    });
  }catch(e){
    await cleanup();
    const msg=String(e?.stderr||e?.message||"");
    console.error("video_compress_failed",msg.slice(0,1200));
    if(/ENOENT/i.test(msg))return res.status(503).json({error:"ffmpeg_unavailable"});
    if(/LIMIT_FILE_SIZE|too large|File too large/i.test(msg))return res.status(413).json({error:"video_too_large"});
    return res.status(422).json({error:"video_compress_failed"});
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

// Long-cache static assets; HTML is revalidated frequently so deployments appear promptly.\napp.use(express.static(WEB_DIR,{maxAge:"30d",etag:true,lastModified:true,setHeaders:(res,file)=>{\n  if(/\\.(html?)$/i.test(file)) res.setHeader("Cache-Control","public,max-age=300,must-revalidate");\n  else if(/\\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(file)) res.setHeader("Cache-Control","public,max-age=2592000,stale-while-revalidate=86400");\n}}));

app.get("/admin",(req,res)=>res.redirect(302,"/owner"));

app.get("/owner",(req,res,next)=>{
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma","no-cache");
  res.setHeader("Expires","0");
  res.sendFile(path.join(WEB_DIR,"owner.html"),err=>{if(err)next();});
});

app.use((req,res,next)=>{
  if(req.path.includes("."))return next();
  res.sendFile(path.join(WEB_DIR,"index.html"),err=>{if(err)next();});
});

app.use((req,res)=>res.status(404).send("Not Found"));

const server=app.listen(PORT,"0.0.0.0",()=>console.log("AmnaYar gateway listening on "+PORT));
server.requestTimeout=2*60*60*1000;
server.headersTimeout=120*1000;
server.keepAliveTimeout=120*1000;
