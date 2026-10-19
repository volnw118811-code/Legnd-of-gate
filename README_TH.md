# Legnd of Gate — Android + Online Starter (v0.2)

โปรเจกต์ต้นแบบเกม 2D fantasy สำหรับ Android พร้อมเซิร์ฟเวอร์ออนไลน์เริ่มต้น ชื่อเกมสะกดตามที่ขอ: **Legnd of Gate**

## สิ่งที่ทำงานในเวอร์ชันนี้
- Android app source: Kotlin + WebView เปิดหน้าเกมจาก `android/app/src/main/assets/index.html`
- สมัครบัญชี / เข้าสู่ระบบผ่าน API; รหัสผ่านเก็บเป็น salted scrypt hash ไม่เก็บรหัสผ่านดิบ
- PostgreSQL เก็บบัญชีผู้เล่น
- WebSocket ตรวจ token ก่อนเชื่อมต่อ, รายชื่อผู้เล่นออนไลน์, เปลี่ยนเมืองที่แสดง, และแชตโลก
- Render blueprint สำหรับเซิร์ฟเวอร์ และ GitHub Actions workflow สำหรับสร้าง debug APK
- ต้นแบบมีหน้าจอเมือง, ตัวละคร, อาชีพ, เควสต์, มอนสเตอร์, ไอเทม และ UI RPG

## ข้อจำกัดสำคัญ
**นี่คือ starter prototype ไม่ใช่ MMORPG พร้อมเปิดให้ผู้เล่นทั่วไปแล้ว** การต่อสู้, EXP, เงิน, ของดรอป, ตลาด, เทรด และกิลด์ส่วนใหญ่ยังจำลองและบันทึกในเครื่อง ไม่ได้ยืนยัน/ซิงก์จากเซิร์ฟเวอร์ จึงยังโกงได้และข้อมูลไม่เหมือนกันระหว่างเครื่อง ต้องพัฒนา authoritative game logic, persistence ของตัวละคร, inventory, market/trade, guild, anti-cheat และระบบดูแลผู้เล่นก่อนเปิดจริง

ยังไม่มี APK ที่คอมไพล์และทดสอบติดตั้งแล้วแนบมาในชุดนี้ สภาพแวดล้อมที่สร้างโปรเจกต์ไม่มี Android SDK/Gradle build toolchain ที่พร้อมใช้ วิธีด้านล่างจะสร้าง APK จริงผ่าน GitHub Actions หรือ Android Studio

## A) ตั้งฐานข้อมูลฟรีสำหรับทดสอบ
1. สร้างโปรเจกต์ PostgreSQL ที่ [Neon](https://neon.com/) แล้วคัดลอก connection string ของฐานข้อมูล โดยต้องเปิด SSL (`sslmode=require`)
2. แผน Free เหมาะสำหรับทดลอง แต่มีโควตา/การพักระบบเมื่อไม่มีการใช้งาน และอาจเปลี่ยนได้ตามเงื่อนไขผู้ให้บริการ โปรดตรวจหน้าแผนก่อนใช้

## B) Deploy เซิร์ฟเวอร์ฟรีบน Render
1. อัปโหลดโฟลเดอร์โปรเจกต์นี้ขึ้น GitHub repository
2. เปิด [Render](https://render.com/) แล้วสร้าง Web Service จาก repository หรือใช้ Blueprint ที่ไฟล์ `render.yaml`
3. ตั้ง root directory เป็น `server` (ถ้าไม่ได้ใช้ Blueprint), build command `npm install`, start command `npm start`, health check path `/health`
4. เพิ่ม environment variables:
   - `DATABASE_URL` = connection string จาก Neon
   - `JWT_SECRET` = random secret ยาวอย่างน้อย 32 ตัวอักษร (ถ้าใช้ Blueprint ให้ Render สร้างให้ได้)
   - `NODE_VERSION` = `20`
5. รอ Deploy สำเร็จ แล้วเปิด `https://ชื่อบริการ.onrender.com/health` ต้องได้ JSON ที่มี `"ok":true`
6. หมายเหตุ: Render Free อาจพัก service หลังไม่มี traffic 15 นาที และการเชื่อมต่ออาจหลุดตอนพัก/Deploy เหมาะสำหรับทดสอบ ไม่ใช่บริการเกม production

## C) สร้าง APK

### วิธีง่าย: GitHub Actions
1. push โฟลเดอร์โปรเจกต์ขึ้น GitHub
2. เปิดแท็บ **Actions** → workflow **Build Android APK** → **Run workflow**
3. เมื่อสำเร็จ เปิด run ล่าสุด แล้วดาวน์โหลด Artifact ชื่อ `Legnd-of-Gate-debug-apk`
4. แตก ZIP จะได้ `app-debug.apk` สำหรับติดตั้งทดสอบบน Android

### หรือใช้ Android Studio
1. ติดตั้ง Android Studio และ Android SDK
2. เปิดโฟลเดอร์ `android` (ไม่ใช่โฟลเดอร์ชั้นนอก)
3. รอ Gradle Sync สำเร็จ
4. เลือก **Build → Build APK(s)**
5. APK debug จะอยู่ที่ `android/app/build/outputs/apk/debug/app-debug.apk`

APK debug ใช้ทดสอบส่วนตัว ไม่ใช่ release ที่เซ็นสำหรับเผยแพร่ Play Store

## D) เชื่อม APK กับเซิร์ฟเวอร์
1. เปิดเกมในมือถือ
2. ช่อง **ที่อยู่เซิร์ฟเวอร์ HTTPS** ใส่ URL จาก Render เช่น `https://your-service.onrender.com` (ไม่ต้องใส่ `/health`)
3. กด **สร้างบัญชีใหม่** เพื่อสมัคร จากนั้นใช้ชื่อบัญชีและรหัสผ่านเดิมเพื่อเข้าสู่ระบบ
4. เมื่อเชื่อมต่อสำเร็จ หน้าโลกเกมจะแสดงผู้เล่นออนไลน์และแชตโลก

ชื่อบัญชีใช้ a-z, A-Z, 0-9 หรือ `_` ความยาว 3–18 ตัว; รหัสผ่าน 8–128 ตัวอักษร

## E) ทดสอบเซิร์ฟเวอร์ในเครื่อง
ต้องมี Node.js 20+ และ PostgreSQL:
```bash
cd server
npm install
# ตั้ง DATABASE_URL และ JWT_SECRET ใน environment
npm start
```

## Roadmap ก่อนเรียกว่า MMORPG เต็มรูปแบบ
1. ย้าย state ตัวละคร, EXP, combat, drops, Mana, Zeny ไปคำนวณฝั่ง server
2. บันทึกตัวละครและ inventory ลงฐานข้อมูล
3. ทำ server-side market/trade transactions และระบบ guild persistence
4. เพิ่ม movement/map collision, monster AI, respawn/dungeon instances และ zone rooms
5. เพิ่ม rate limiting ที่ทนทาน, moderation, backups, monitoring, anti-cheat, load tests และ release signing

หลีกเลี่ยงการใช้ภาพ โลโก้ หรือ assets ของเกมอื่นโดยไม่ได้รับอนุญาต
