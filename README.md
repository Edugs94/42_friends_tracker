# 42 Friends Tracker

A browser extension to track your 42 school friends' status, rankings, and exams in real-time without reloading tabs.

**🔗 [Install the Extension](https://42friendstracker.netlify.app)** *(automatically redirects to Chrome Web Store or Firefox Add-ons based on your browser)*

---

## ✨ Features

- **👥 Friends Tracking** - Monitor your friends' online status and current location in real-time
- **🏆 Rankings** - Compare levels and evaluation points among your friends
- **📝 Exam Tracking** - Live tracking of exam progress with automatic 5-minute refresh
- **💡 Project Tooltips** - Hover over friends to see their active projects and time spent
- **🔐 Secure Authentication** - OAuth2 login through official 42 API (your password is never stored)
- **💾 Sync Across Devices** - Your friends list syncs across all your browsers

---

## 🛠️ Installation

### From Store (Recommended)

Visit **[42friendstracker.netlify.app](https://42friendstracker.netlify.app)** and you'll be automatically redirected to the appropriate store for your browser.

### Manual Installation (Development)

#### Chrome

1. Download or clone this repository
2. Open `chrome://extensions/` in Chrome
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the `chrome_package` folder

#### Firefox

1. Download or clone this repository
2. Open `about:debugging#/runtime/this-firefox` in Firefox
3. Click "Load Temporary Add-on"
4. Select any file inside the `firefox_package` folder

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### Pull Request Process

1. **Fork the repository**

   ```bash
   git clone https://github.com/YOUR_USERNAME/42_friends_tracker.git
   cd 42_friends_tracker
   ```

2. **Create a feature branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Chrome extension code is in `chrome_package/`
   - Firefox extension code is in `firefox_package/`
   - Keep both packages synchronized when making changes

4. **Test your changes**
   - Load the extension locally (see Manual Installation above)
   - Test on both Chrome and Firefox if possible
   - Verify OAuth login still works
   - Check that all tabs function correctly

5. **Commit your changes**

   ```bash
   git add .
   git commit -m "feat: brief description of your changes"
   ```

6. **Push to your fork**

   ```bash
   git push origin feature/your-feature-name
   ```

7. **Open a Pull Request**
   - Go to the original repository on GitHub
   - Click "New Pull Request"
   - Select your fork and branch
   - Provide a clear description of your changes
   - Submit and wait for review

### Code Guidelines

- Keep code consistent with existing style
- Comment complex logic
- Update both `chrome_package` and `firefox_package` when applicable
- Test thoroughly before submitting

### Generating Distribution Zips

To create distributable zip files for both browsers:

```bash
python generate_zips.py
```

This creates `chrome_extension.zip` and `firefox_extension.zip` in the root directory.

---

## 📁 Project Structure

```
42_friends_tracker/
├── chrome_package/          # Chrome extension
│   ├── manifest.json        # Chrome manifest v3
│   ├── background.js        # Service worker
│   ├── content.js           # Widget injection
│   ├── styles.css           # Widget styles
│   └── icons/               # Extension icons
├── firefox_package/         # Firefox extension
│   ├── manifest.json        # Firefox manifest v3
│   ├── background.js        # Background script
│   ├── content.js           # Widget injection
│   ├── styles.css           # Widget styles
│   └── icons/               # Extension icons
├── privacy.html             # Privacy policy
├── generate_zips.py         # Build script
└── README.md
```

---

## 🔒 Privacy

This extension respects your privacy:

- Only fetches data from the official 42 API
- No browsing history tracking
- No analytics or third-party data sharing
- All data stored locally in your browser

Read the full [Privacy Policy](privacy.html).

---

## 📄 License

This project is open source. Feel free to use, modify, and distribute.

---

## 🐛 Issues & Support

Found a bug or have a feature request? Open an issue on GitHub.
