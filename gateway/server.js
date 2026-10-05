const express=require("express");
const path=require("path");
const crypto=require("crypto");
const fs=require("fs");
const os=require("os");
const util=require("util");
const {execFile}=require("child_process");
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

  const quality=Math.max(35,Math.min(85,Number(req.body?.quality||70)));
  const output=path.join(os.tmpdir(),"amnayar-compressed-"+crypto.randomUUID()+".pdf");
  const settings=quality<=40?"/screen":quality<=60?"/ebook":quality<=75?"/ebook":"/printer";

  const cleanup=async()=>Promise.allSettled([
    fs.promises.unlink(input),
    fs.promises.unlink(output)
  ]);

  const runGs=async(out,level)=>{
    const imageDpi=level<=40?72:level<=60?96:level<=75?120:160;
    const jpegQ=level<=40?40:level<=60?52:level<=75?68:82;
    const preset=level<=40?"/screen":level<=60?"/ebook":level<=75?"/ebook":"/printer";
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
    ],{timeout:35*60*1000,maxBuffer:4*1024*1024});
  };

  try{
    await runGs(output,quality);
    let stat=await fs.promises.stat(output);

    // Ghostscript can occasionally make an already-optimized PDF larger.
    // In that case retry once with a stronger compression profile.
    if(stat.size>=req.file.size && quality>40){
      await fs.promises.unlink(output).catch(()=>{});
      await runGs(output,40);
      stat=await fs.promises.stat(output);
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
server.requestTimeout=35*60*1000;
server.headersTimeout=120*1000;
server.keepAliveTimeout=120*1000;
