# ucube işi pikseller

Görsel dönüştürme, piksel sanatı ve metin efektleri oluşturmak için geliştirilmiş tarayıcı tabanlı minimalist bir araç.

## Özellikler

- **Piksel Efekti:** Görselleri piksel tabanlı grafiklere çevirme.
- **Glitch Metin & Görsel:** Metin ve resimler üzerinde bozulma/glitch efektleri oluşturma.
- **PWA Desteği:** İnternet bağlantısı olmadan da çalışabilme ve cihaza yükleneb

---

## Anomalies // Retro Media Lab (v2.08) 🎨

Fotoğrafları tamamen tarayıcı üzerinde, sunucuya hiçbir veri göndermeden işleyen **çevrimdışı PWA** görsel efekt laboratuvarı. WebGL2 shader hızlandırma ve Web Worker arka plan işleme desteğiyle yüksek çözünürlüklü görsellerde akıcı çalışır.

### Efekt Motorları 🎛️

- **Pixel Art:** Game Boy, GB Pocket, CGA, C64, Cyberpunk ve Vaporwave paletleriyle Bayer, Floyd-Steinberg veya Atkinson dithering.
- **Spider Glitch:** Kromatik kayma, Ben-Day nokta deseni, keskin poligon parçaları ve mobilde sarsıntı/eğim (jiroskop) tepkisi *(WebGL2 + CPU)*.
- **Sensor Corrupt:** Chaos blok bozulmaları ve Standard RGB satır/bit kayması *(Web Worker)*.
- **Glitch Tipografi:** Görsele otomatik sığan RGB Shift, VHS Timestamp ve Punk Stamp metin efektleri.
- **CRT TV:** Ayarlanabilir tarama çizgileri ve fosfor bloom parlaması *(WebGL2 + CPU)*.
- **ASCII Matrix:** Karakter seti (Yoğunluk, Binary, Hex, Özel Metin) ve Matrix/Amber/Renkli ASCII modları *(WebGL2 + CPU)*.
- **Market Fişi:** Termal kağıt dokusu, Atkinson/Bayer tarama, yazıcı aşınması ve tırtıklı kenarlar *(Web Worker)*.
- **Termal Görüş (FLIR):** Ironbow, Rainbow ve Emerald renk haritaları *(WebGL2 + CPU)*.
- **CMYK Matbaa:** Ofset baskı halftone rozet açıları ve ayarlanabilir kanal kayması *(WebGL2 + CPU)*.
- **Kötü Fotokopi (Fanzine):** Yüksek kontrastlı fanzin eşikleme ve toner kirliliği *(WebGL2 + CPU)*.
- **Color Clash:** ZX Spectrum 8×8 renk niteliği çakışması benzetimi *(Web Worker)*.
- **Van Gogh:** Scharr yapı tensörü, OKLab pigment titreşimi, kıvrımlı fırça şeritleri ve Blinn-Phong impasto kabartma ışığı *(WebGL2 + Web Worker)*.
- **Minecraft:** OKLab renk eşlemeli 2D dokulu harita ve 2.5D izometrik voksel yığınları (Klasik / Renkli palet).
- **Kartpostal / Pul:** Tırtıklı pul çerçevesi ve Scharr tensörü tabanlı banknot gravür tarama *(Web Worker)*.

### Öne Çıkan Özellikler ✨

- **Önce / Sonra Karşılaştırma:** Etkileşimli sürgülü bölünmüş ekran ile orijinal ve işlenmiş görseli anlık kıyaslama.
- **Global Metin Damgası:** Tüm motorların üzerine çizgi roman kapak çerçevesi ve ölçeklenebilir onomatopoeia metin damgası ekleme.
- **Esnek Dışa Aktarma:** PNG (kayıpsız), WEBP veya JPEG formatlarında kalite ve azami boyut (`Orijinal`, `2048 px`, `1200 px`) seçimi; `JPG/PNG/WEBP/HEIC` desteği.
- **GPU / CPU Geçişi:** Tek tıkla WebGL2 hızlandırması ve CPU referans işleme arasında geçiş yapabilme.

### Geliştirme ve Test Komutları 💻

```bash
npm install
npm run dev        # Yerel geliştirme sunucusu
npm run lint       # ESLint kod denetimi
npm run typecheck  # TypeScript tip denetimi
npm test           # Vitest birim testleri
npm run build      # Üretim derlemesi ve PWA manifest üretimi
npm run test:e2e   # Playwright tarayıcı testleri
```
