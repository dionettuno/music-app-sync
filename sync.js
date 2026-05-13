const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const supabase = createClient(
  process.env.SUPABASE_URL.trim(), 
  process.env.SUPABASE_KEY.trim()
);

const s3 = new S3Client({
  region: "us-east-1",
  endpoint: `https://${process.env.CF_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com`,
  credentials: { 
    accessKeyId: process.env.R2_ACCESS_KEY.trim(), 
    secretAccessKey: process.env.R2_SECRET_KEY.trim() 
  },
  forcePathStyle: true
});

// INSERISCI QUI L'URL DELLA TUA WORKER
const PROXY_URL = "https://music-proxy.vector-devv.workers.dev/";

async function run() {
  console.log("Sincronizzazione iniziata...");
  const { data: tracks, error } = await supabase.from('tracks').select('*');
  if (error) throw error;

  // --- SOSTITUIAMO STATICALLY CON IL TUO PROXY PERSONALE ---
  const indexData = tracks.map(t => ({ 
    id: t.id, 
    title: t.title, 
    artist: t.artist, 
    album: t.album,
    tag: t.tag,
    language: t.language,
    image_url: t.image_url ? t.image_url.replace("https://", PROXY_URL) : null
  }));
  
  await upload("tracks_index.json", indexData);
  console.log("Indice caricato!");

  for (const track of tracks) {
    const fileName = `tracks/${track.title.toLowerCase().replace(/ /g, "_")}.json`;
    const detailedData = {
      ...track,
      // Aggiorniamo anche i file completi con il Proxy
      audio_url: track.audio_url ? track.audio_url.replace("https://", PROXY_URL) : null,
      image_url: track.image_url ? track.image_url.replace("https://", PROXY_URL) : null,
      artist_img_url: track.artist_img_url ? track.artist_img_url.replace("https://", PROXY_URL) : null,
    };
    await upload(fileName, detailedData);
  }
  console.log("Fatto! Tutto su Cloudflare.");
}

async function upload(key, body) {
  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME.trim(), 
    Key: key, 
    Body: JSON.stringify(body), 
    ContentType: "application/json"
  }));
}

run();
