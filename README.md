# 🎵 DeDeezer - Deezer Desktop Ad Blocker

**Fully vibecoded** - A powerful, cross-platform patcher for Deezer Desktop that integrates Ghostery's adblocker to provide an ad-free music streaming experience.

## ✨ Features

- 🚫 **Ad Blocking**: Integrates Ghostery's Electron adblocker for comprehensive ad blocking
- 🔧 **Auto-Patcher**: Intelligent autopatch system with backup management
- 🖥️ **Cross-Platform**: Windows support implemented, macOS and Linux ready for implementation
- 📦 **Package Manager Detection**: Automatically detects and uses npm, yarn, or pnpm
- 🛡️ **Safe Patching**: Creates automatic backups before patching
- 🔄 **Re-patch Support**: Safely re-patch using existing backups
- 🧹 **Auto Cleanup**: Automatic cleanup of temporary files
- ⚡ **Process Management**: Automatically handles running Deezer processes

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- Deezer Desktop installed
- Package manager (npm, yarn, or pnpm)

### Installation & Usage

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/DeDeezer.git
   cd DeDeezer
   ```

2. **Run the autopatcher**:
   ```bash
   node autopatch.js
   ```

3. **Enjoy ad-free Deezer!** 🎉

## 🛠️ Manual Patching (Alternative)

If you prefer manual control, you can use the batch file:

```bash
# Windows
patch.bat
```

## 📋 How It Works

The patcher performs the following steps:

1. **Process Check**: Automatically detects and closes running Deezer instances
2. **Backup Creation**: Creates a backup of the original `app.asar` file
3. **Extraction**: Extracts the Deezer application archive
4. **Patching**: 
   - Renames original `main.js` to `main.original.js`
   - Injects custom main.js with Ghostery integration
   - Installs Ghostery adblocker dependencies
5. **Repackaging**: Repacks the modified application
6. **Installation**: Replaces the original with the patched version
7. **Cleanup**: Removes temporary files

## 🔧 Advanced Usage

### Command Line Options

```bash
# Show help
node autopatch.js --help

# Show macOS setup instructions
node autopatch.js --setup-macos

# Show Linux setup instructions  
node autopatch.js --setup-linux
```

### Re-patching

If Deezer is already patched, the tool will:
- Detect the existing patch
- Offer to re-patch using the backup file
- Safely restore and re-apply the patch

## 🖥️ Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| Windows  | ✅ Fully Supported | Tested and working |
| macOS    | 🚧 Ready for Implementation | Paths configured, needs testing |
| Linux    | 🚧 Ready for Implementation | Paths configured, needs testing |

## 📁 Project Structure

```
DeDeezer/
├── autopatch.js           # Main autopatcher script
├── patch.bat             # Manual patch batch file
├── patch_files/          # Patch components
│   ├── ghostery.js       # Ghostery adblocker integration
│   └── loadextention.js  # Extension loader
├── decomp/               # Decompiled/modified Deezer files
├── app.asar              # Original Deezer archive
├── app.new.asar          # Patched archive
└── README.md             # This file
```

## 🔍 Technical Details

### Ghostery Integration

The patcher integrates Ghostery's Electron adblocker by:
- Injecting the adblocker before Deezer's main process starts
- Setting up session filters for comprehensive ad blocking
- Maintaining compatibility with Deezer's existing functionality

### Environment Variables

The patcher automatically sets:
- `DZ_DEVTOOLS=yes` - Enables developer tools
- `DZ_DISABLE_UPDATE=yes` - Disables automatic updates

### Backup System

- Backups are stored as `app.bak.asar` in the Deezer resources directory
- Original files are preserved for safe restoration
- Re-patching uses the backup to ensure clean patches

## ⚠️ Important Notes

- **Backup**: Always keep your backup files safe
- **Updates**: Disable Deezer auto-updates to prevent patch removal
- **Antivirus**: Some antivirus software may flag the patcher - this is a false positive
- **Terms of Service**: Use responsibly and in accordance with Deezer's terms

## 🐛 Troubleshooting

### Common Issues

1. **"Deezer asar file not found"**
   - Ensure Deezer Desktop is properly installed
   - Check if the installation path is correct

2. **Permission errors**
   - Run as administrator on Windows
   - Ensure write permissions to Deezer directory

3. **Patch detection fails**
   - Try running the patcher again
   - Check if backup files exist

### Getting Help

If you encounter issues:
1. Check the console output for error messages
2. Ensure all prerequisites are installed
3. Try running with administrator privileges
4. Create an issue with detailed error information

## 🤝 Contributing

Contributions are welcome! Areas that need help:
- macOS implementation and testing
- Linux implementation and testing
- UI improvements
- Additional adblocker integrations

## 📄 License

This project is for educational purposes. Please respect Deezer's terms of service and use responsibly.

## 🎯 Disclaimer

This tool modifies the Deezer Desktop application. Use at your own risk. The authors are not responsible for any issues that may arise from using this software.

---

**Fully vibecoded** with ❤️ for the music streaming community
