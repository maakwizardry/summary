# 🚀 Deploy to AWS EC2 - Complete Guide

## ✅ Prerequisites (You Already Have)

- ✅ AWS EC2 instance running
- ✅ Node.js installed
- ✅ Git installed
- ✅ Git repository ready

---

## 📋 Step-by-Step Deployment

### Step 1: SSH into Your EC2 Instance

```bash
# From your local machine
ssh -i /path/to/your-key.pem ubuntu@your-ec2-ip-address

# Or if using Amazon Linux
ssh -i /path/to/your-key.pem ec2-user@your-ec2-ip-address
```

---

### Step 2: Verify Node.js & Git Installation

```bash
# Check versions
node --version    # Should be v14+ (v18+ recommended)
npm --version
git --version

# If Node.js is old, update it:
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

### Step 3: Clone Your Repository

```bash
# Navigate to home directory
cd ~

# Clone your repository
git clone https://github.com/your-username/summary_backend.git

# Or if private repo, use:
git clone https://<github-token>@github.com/your-username/summary_backend.git

# Navigate into project
cd summary_backend
```

---

### Step 4: Install Dependencies

```bash
# Install all npm packages
npm install

# This will install all dependencies from package.json
```

---

### Step 5: Set Up Environment Variables

```bash
# Create .env file
nano .env

# Or use vim
vim .env
```

**Paste this content** (replace with your actual values):

```env
# Server Configuration
PORT=8080

# Database (Use MongoDB Atlas - NOT localhost)
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/briefme

# Google Gemini AI (REQUIRED)
GEMINI_API_KEY=your_gemini_api_key_here

# JWT Secret (REQUIRED)
JWT_SECRET=your_random_32_character_secret_here

# Email Configuration (REQUIRED for OTP)
EMAIL_USER=your.email@gmail.com
EMAIL_PASS=your_gmail_16_char_app_password

# Lemon Squeezy Payment (Optional)
LEMONSQUEEZY_API_KEY=your_lemonsqueezy_key_here
```

**Save and exit:**
- In nano: `Ctrl + X`, then `Y`, then `Enter`
- In vim: Press `Esc`, type `:wq`, press `Enter`

---

### Step 6: Install PM2 (Process Manager)

PM2 keeps your app running even after you close SSH:

```bash
# Install PM2 globally
sudo npm install -g pm2

# Verify installation
pm2 --version
```

---

### Step 7: Start Your Application

```bash
# Start the app with PM2
pm2 start index.js --name "briefme-backend"

# Check if it's running
pm2 status

# View logs
pm2 logs briefme-backend

# View real-time logs
pm2 logs briefme-backend --lines 50
```

---

### Step 8: Configure PM2 to Start on Reboot

```bash
# Generate startup script
pm2 startup

# This will output a command like:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Copy and run that command

# Save current PM2 process list
pm2 save
```

---

### Step 9: Configure EC2 Security Group (Firewall)

**Open AWS Console:**

1. Go to: https://console.aws.amazon.com/ec2/
2. Select your EC2 instance
3. Click "Security" tab → Click on Security Group
4. Click "Edit inbound rules"

**Add these rules:**

| Type | Protocol | Port Range | Source | Description |
|------|----------|------------|--------|-------------|
| HTTP | TCP | 80 | 0.0.0.0/0 | Allow HTTP |
| HTTPS | TCP | 443 | 0.0.0.0/0 | Allow HTTPS |
| Custom TCP | TCP | 8080 | 0.0.0.0/0 | Node.js App |
| SSH | TCP | 22 | Your IP | SSH Access |

5. Click "Save rules"

---

### Step 10: Test Your API

```bash
# Test from within EC2
curl http://localhost:8080

# Test from your local machine
curl http://your-ec2-public-ip:8080

# Expected response: "API is running..."
```

---

## 🌐 Set Up Nginx Reverse Proxy (Optional but Recommended)

This allows you to:
- Access your API on port 80/443 (not 8080)
- Enable HTTPS with SSL certificate
- Better performance

### Install Nginx

**For Amazon Linux 2 / Amazon Linux 2023 (yum):**

```bash
# Update packages
sudo yum update -y

# Install Nginx
sudo amazon-linux-extras install nginx1 -y
# OR if amazon-linux-extras doesn't work:
sudo yum install nginx -y

# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Check status
sudo systemctl status nginx
```

**For Ubuntu/Debian (apt):**

```bash
sudo apt update
sudo apt install nginx -y

# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Configure Nginx

**For Amazon Linux (no sites-available/sites-enabled structure):**

```bash
# Create Nginx configuration directly in conf.d
sudo nano /etc/nginx/conf.d/briefme.conf
```

**Paste this:**

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Or use your EC2 IP or underscore _

    client_max_body_size 100M;  # For file uploads

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**For Ubuntu/Debian (sites-available structure):**

```bash
# Create Nginx configuration
sudo nano /etc/nginx/sites-available/briefme
# (Paste the same nginx config as above)

# Create symbolic link
sudo ln -s /etc/nginx/sites-available/briefme /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default
```

**Test and restart (both systems):**

```bash
# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

**Now access your API at:**
- http://your-ec2-ip (no need for :8080)

---

## 🔒 Set Up HTTPS with Let's Encrypt (Optional)

### Prerequisites:
- Domain name pointing to your EC2 IP
- Nginx installed

### Install Certbot

**For Amazon Linux 2:**

```bash
# Enable EPEL repository
sudo amazon-linux-extras install epel -y

# Install Certbot
sudo yum install certbot python3-certbot-nginx -y
```

**For Ubuntu/Debian:**

```bash
sudo apt install certbot python3-certbot-nginx -y
```

### Get SSL Certificate

```bash
# Replace with your domain
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Follow the prompts:
# - Enter email
# - Agree to terms
# - Choose redirect HTTP to HTTPS (recommended)
```

### Auto-renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Certbot automatically adds a cron job for renewal
```

**Your API is now available at:**
- https://yourdomain.com

---

## 📊 Useful PM2 Commands

```bash
# View all processes
pm2 list

# View logs
pm2 logs briefme-backend

# Restart application
pm2 restart briefme-backend

# Stop application
pm2 stop briefme-backend

# Delete from PM2
pm2 delete briefme-backend

# Monitor CPU/Memory
pm2 monit

# View detailed info
pm2 show briefme-backend
```

---

## 🔄 Update Your Application (Deploy New Changes)

When you make code changes:

```bash
# SSH into EC2
ssh -i your-key.pem ubuntu@your-ec2-ip

# Navigate to project
cd ~/summary_backend

# Pull latest changes
git pull origin main

# Install any new dependencies
npm install

# Restart application
pm2 restart briefme-backend

# Check logs
pm2 logs briefme-backend
```

---

## 🐛 Troubleshooting

### Issue: App not starting

```bash
# Check logs
pm2 logs briefme-backend

# Common issues:
# - MongoDB connection failed → Check MONGO_URI
# - Port already in use → Change PORT in .env
# - Missing dependencies → Run npm install
```

### Issue: Can't connect from browser

```bash
# Check if app is running
pm2 status

# Check if port 8080 is listening
sudo netstat -tulpn | grep 8080

# Check Security Group allows port 8080
# Check EC2 instance firewall (ufw)
sudo ufw status
```

### Issue: MongoDB connection error

```bash
# Verify MongoDB Atlas Network Access
# Must allow: 0.0.0.0/0 or your EC2 IP

# Test connection
node -e "require('mongoose').connect('your-mongo-uri').then(() => console.log('✅ Connected')).catch(e => console.log('❌ Error:', e.message))"
```

### Issue: Email not sending

```bash
# Check Gmail App Password
# Make sure 2FA is enabled
# Use 16-character app password, not regular password
```

---

## 📈 Monitor Your Application

### View Logs

```bash
# Real-time logs
pm2 logs briefme-backend --lines 100

# Logs location
~/.pm2/logs/
```

### Monitor Resources

```bash
# CPU & Memory usage
pm2 monit

# Detailed stats
pm2 show briefme-backend
```

### Set Up Log Rotation

```bash
# Install PM2 log rotate
pm2 install pm2-logrotate

# Configure (optional)
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## 🔐 Security Best Practices

### 1. Use Environment Variables

```bash
# Never commit .env to git
# Add to .gitignore:
echo ".env" >> .gitignore
```

### 2. Configure Firewall

**For Amazon Linux (Security Groups recommended):**
- Amazon Linux doesn't have UFW by default
- **Use EC2 Security Groups** to manage inbound/outbound rules (recommended)
- Security Groups are configured in AWS Console under EC2 → Security Groups

**For Ubuntu (UFW firewall):**

```bash
# Enable UFW
sudo ufw enable

# Allow only necessary ports
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw allow 8080  # Node.js (if not using Nginx)

# Check status
sudo ufw status
```

### 3. Keep System Updated

```bash
# Update packages
sudo apt update
sudo apt upgrade -y
```

### 4. Create Swap Space (if low memory)

```bash
# Check memory
free -h

# Create 2GB swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 🎯 Complete Deployment Checklist

- [ ] EC2 instance running
- [ ] Node.js & npm installed
- [ ] Git repository cloned
- [ ] Dependencies installed (`npm install`)
- [ ] `.env` file created with all variables
- [ ] PM2 installed globally
- [ ] Application started with PM2
- [ ] PM2 configured for auto-restart on reboot
- [ ] Security Group configured (ports 80, 443, 8080, 22)
- [ ] MongoDB Atlas connection working
- [ ] API tested and responding
- [ ] (Optional) Nginx reverse proxy configured
- [ ] (Optional) HTTPS with Let's Encrypt
- [ ] Logs monitored and working

---

## 🚀 Quick Start Commands (Summary)

```bash
# 1. SSH into EC2
ssh -i your-key.pem ubuntu@your-ec2-ip

# 2. Clone & setup
cd ~
git clone <your-repo-url>
cd summary_backend
npm install

# 3. Create .env (add your values)
nano .env

# 4. Install & start with PM2
sudo npm install -g pm2
pm2 start index.js --name briefme-backend
pm2 startup
pm2 save

# 5. Test
curl http://localhost:8080
```

---

## 📞 Your API Endpoints

Once deployed:

```
Base URL: http://your-ec2-ip:8080

GET  /                          → "API is running..."
POST /api/users/register        → Register user
POST /api/users/verify-otp      → Verify OTP  
POST /api/users/login           → Login
GET  /api/users/profile         → Get profile (auth required)
POST /api/process               → AI summarization
POST /api/contactus             → Contact form
GET  /api/payment/products      → Get products
POST /api/payment/subscribe     → Subscribe
POST /webhook                   → Lemon Squeezy webhook
```

---

## 💰 EC2 Cost Estimate

**Free Tier (First 12 months):**
- ✅ 750 hours/month t2.micro - **FREE**
- ✅ 30 GB EBS storage - **FREE**
- ✅ 15 GB bandwidth out - **FREE**

**After Free Tier:**
- t2.micro: ~$8-10/month
- t2.small: ~$17/month (if you need more power)

---

## 🎉 You're Ready!

Your Node.js backend is now deployed on AWS EC2 with:
- ✅ Auto-restart on crashes
- ✅ Runs in background (PM2)
- ✅ Persistent across reboots
- ✅ Production-ready configuration

---

**Questions?** Check logs with `pm2 logs` or review troubleshooting section!

Good luck! 🚀
