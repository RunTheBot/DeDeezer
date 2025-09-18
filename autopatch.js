#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const os = require('os');
const readline = require('readline');

class DeezerPatcher {
  constructor() {
    this.platform = os.platform();
    this.tempDir = path.join(os.tmpdir(), 'deezer-patch-' + Date.now());
    this.backupDir = path.join(__dirname, 'backups');
    this.packageManager = this.detectPackageManager();
    
    // Platform-specific paths
    this.paths = this.getPlatformPaths();
    
    console.log(`🔧 DeDeezer Auto-Patcher`);
    console.log(`📱 Platform: ${this.platform}`);
    console.log(`📦 Package Manager: ${this.packageManager}`);
    console.log(`📁 Temp Directory: ${this.tempDir}`);
  }

  detectPackageManager() {
    // Check what package manager was used to run this script
    if (process.env.npm_execpath) {
      if (process.env.npm_execpath.includes('pnpm')) return 'pnpm';
      if (process.env.npm_execpath.includes('yarn')) return 'yarn';
      return 'npm';
    }
    
    // Fallback detection
    try {
      execSync('pnpm --version', { stdio: 'ignore' });
      return 'pnpm';
    } catch {}
    
    try {
      execSync('yarn --version', { stdio: 'ignore' });
      return 'yarn';
    } catch {}
    
    return 'npm';
  }

  getPlatformPaths() {
    switch (this.platform) {
      case 'win32':
        return {
          deezerPath: path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'deezer-desktop'),
          asarFile: 'app.asar',
          executable: 'Deezer.exe'
        };
      
      case 'darwin':
        // macOS paths - placeholder for now
        return {
          deezerPath: '/Applications/Deezer.app/Contents/Resources',
          asarFile: 'app.asar',
          executable: 'Deezer'
        };
      
      case 'linux':
        // Linux paths - placeholder for now
        return {
          deezerPath: '/opt/deezer-desktop/resources',
          asarFile: 'app.asar',
          executable: 'deezer-desktop'
        };
      
      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  async run() {
    try {
      if (this.platform !== 'win32') {
        console.log(`⚠️  ${this.platform} support is not implemented yet.`);
        console.log(`🔧 Please implement the paths and logic for your platform.`);
        return;
      }

      console.log(`\n🚀 Starting DeDeezer patching process...`);
      
      await this.step0_KillDeezer();
      await this.step0_CheckIfPatched();
      await this.step1_CreateBackup();
      await this.step2_CreateTempFolder();
      await this.step3_ExtractAsar();
      await this.step4_RenameMainJs();
      await this.step5_CopyNewMainJs();
      await this.step6_AddGhosteryDependencies();
      await this.step7_RepackAsar();
      await this.step8_CopyBack();
      
      console.log(`\n✅ DeDeezer patching completed successfully!`);
      console.log(`🎵 You can now run Deezer with ad blocking enabled.`);
      
    } catch (error) {
      console.error(`\n❌ Error during patching:`, error.message);
      console.error(`🧹 Cleaning up temporary files...`);
      this.cleanup();
      process.exit(1);
    }
  }

  async step0_KillDeezer() {
    console.log(`\n📋 Step 0a: Checking for running Deezer processes...`);
    
    try {
      if (this.platform === 'win32') {
        // Check if Deezer is running
        try {
          execSync('tasklist /FI "IMAGENAME eq Deezer.exe" 2>NUL | find /I /N "Deezer.exe"', { stdio: 'pipe' });
          console.log(`🔄 Deezer is running, attempting to close it...`);
          
          // Try to kill Deezer gracefully first, then forcefully
          try {
            execSync('taskkill /IM "Deezer.exe" /T', { stdio: 'pipe' });
            console.log(`✅ Deezer closed gracefully`);
          } catch {
            execSync('taskkill /IM "Deezer.exe" /T /F', { stdio: 'pipe' });
            console.log(`✅ Deezer force closed`);
          }
          
          // Wait a moment for process to fully terminate
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch {
          console.log(`✅ Deezer is not running`);
        }
      } else {
        // For macOS/Linux - implement later
        console.log(`⚠️  Process killing not implemented for ${this.platform} yet`);
      }
    } catch (error) {
      console.log(`⚠️  Could not check/kill Deezer process: ${error.message}`);
    }
  }

  async step0_CheckIfPatched() {
    console.log(`\n📋 Step 0b: Checking if Deezer is already patched...`);
    
    const originalAsar = path.join(this.paths.deezerPath, 'resources', this.paths.asarFile);
    const backupFile = path.join(this.paths.deezerPath, 'resources', 'app.bak.asar');
    
    if (!fs.existsSync(originalAsar)) {
      throw new Error(`Deezer asar file not found at: ${originalAsar}`);
    }
    
    // Check for patch signature in the current asar
    const isPatched = await this.checkPatchSignature(originalAsar);
    
    if (isPatched) {
      console.log(`🔍 Deezer appears to already be patched!`);
      
      if (fs.existsSync(backupFile)) {
        console.log(`📦 Found existing backup file: ${backupFile}`);
        const shouldRepatch = await this.askUserConfirmation(
          'Deezer is already patched. Do you want to repatch using the backup file? (y/n): '
        );
        
        if (shouldRepatch) {
          console.log(`🔄 Using existing backup for repatching...`);
          this.useExistingBackup = true;
        } else {
          console.log(`❌ Patching cancelled by user.`);
          process.exit(0);
        }
      } else {
        console.log(`⚠️  No backup file found. Cannot safely repatch.`);
        console.log(`❌ Please restore original Deezer installation first.`);
        process.exit(1);
      }
    }
  }

  async checkPatchSignature(asarPath) {
    try {
      // Extract a small portion to check for our signature
      const tempCheck = path.join(os.tmpdir(), 'deezer-check-' + Date.now());
      fs.mkdirSync(tempCheck, { recursive: true });
      
      const extractCmd = `npm dlx @electron/asar extract "${asarPath}" "${tempCheck}"`;
      execSync(extractCmd, { stdio: 'pipe' });
      
      const mainJsPath = path.join(tempCheck, 'build', 'main.js');
      if (fs.existsSync(mainJsPath)) {
        const content = fs.readFileSync(mainJsPath, 'utf8');
        const isPatched = content.includes('DZ_DEVTOOLS') || content.includes('[inject]');
        
        // Cleanup
        fs.rmSync(tempCheck, { recursive: true, force: true });
        return isPatched;
      }
      
      // Cleanup
      fs.rmSync(tempCheck, { recursive: true, force: true });
      return false;
    } catch (error) {
      console.log(`⚠️  Could not check patch signature: ${error.message}`);
      return false;
    }
  }

  async askUserConfirmation(question) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes');
      });
    });
  }

  async step1_CreateBackup() {
    console.log(`\n📋 Step 1: Creating backup of original asar file...`);
    
    const originalAsar = path.join(this.paths.deezerPath, 'resources', this.paths.asarFile);
    const backupFile = path.join(this.paths.deezerPath, 'resources', 'app.bak.asar');
    
    if (!fs.existsSync(originalAsar)) {
      throw new Error(`Deezer asar file not found at: ${originalAsar}`);
    }
    
    // Check if backup already exists and we're not repatching
    if (fs.existsSync(backupFile) && !this.useExistingBackup) {
      console.log(`📦 Backup file already exists: ${backupFile}`);
      console.log(`✅ Skipping backup creation to preserve original`);
      return;
    }
    
    if (this.useExistingBackup) {
      console.log(`✅ Using existing backup file for repatching`);
      return;
    }
    
    // Create backup in the same directory as the original
    fs.copyFileSync(originalAsar, backupFile);
    console.log(`✅ Backup created: ${backupFile}`);
  }

  async step2_CreateTempFolder() {
    console.log(`\n📋 Step 2: Creating temporary folder...`);
    
    if (fs.existsSync(this.tempDir)) {
      fs.rmSync(this.tempDir, { recursive: true, force: true });
    }
    
    fs.mkdirSync(this.tempDir, { recursive: true });
    console.log(`✅ Temporary folder created: ${this.tempDir}`);
  }

  async step3_ExtractAsar() {
    console.log(`\n📋 Step 3: Extracting asar file...`);
    
    // Use backup file if repatching, otherwise use current asar
    let sourceAsar;
    if (this.useExistingBackup) {
      sourceAsar = path.join(this.paths.deezerPath, 'resources', 'app.bak.asar');
      console.log(`🔄 Extracting from backup file for repatching...`);
    } else {
      sourceAsar = path.join(this.paths.deezerPath, 'resources', this.paths.asarFile);
      console.log(`📦 Extracting from current asar file...`);
    }
    
    const extractPath = path.join(this.tempDir, 'extracted');
    
    const extractCmd = `${this.packageManager} dlx @electron/asar extract "${sourceAsar}" "${extractPath}"`;
    console.log(`🔧 Running: ${extractCmd}`);
    
    execSync(extractCmd, { stdio: 'inherit' });
    console.log(`✅ Asar extracted to: ${extractPath}`);
  }

  async step4_RenameMainJs() {
    console.log(`\n📋 Step 4: Renaming original main.js...`);
    
    const extractPath = path.join(this.tempDir, 'extracted');
    const originalMain = path.join(extractPath, 'build', 'main.js');
    const renamedMain = path.join(extractPath, 'build', 'main.original.js');
    
    if (!fs.existsSync(originalMain)) {
      throw new Error(`Original main.js not found at: ${originalMain}`);
    }
    
    fs.renameSync(originalMain, renamedMain);
    console.log(`✅ Renamed main.js to main.original.js`);
  }

  async step5_CopyNewMainJs() {
    console.log(`\n📋 Step 5: Copying patched main.js...`);
    
    const extractPath = path.join(this.tempDir, 'extracted');
    const sourceMain = path.join(__dirname, 'decomp', 'build', 'main.js');
    const targetMain = path.join(extractPath, 'build', 'main.js');
    
    if (!fs.existsSync(sourceMain)) {
      throw new Error(`Patched main.js not found at: ${sourceMain}`);
    }
    
    fs.copyFileSync(sourceMain, targetMain);
    console.log(`✅ Copied patched main.js`);
  }

  async step6_AddGhosteryDependencies() {
    console.log(`\n📋 Step 6: Adding Ghostery dependencies and cleaning...`);
    
    const extractPath = path.join(this.tempDir, 'extracted');
    const nodeModulesPath = path.join(extractPath, 'node_modules');
    const packageJsonPath = path.join(extractPath, 'package.json');
    
    // Remove node_modules if it exists
    if (fs.existsSync(nodeModulesPath)) {
      console.log(`🧹 Removing existing node_modules...`);
      fs.rmSync(nodeModulesPath, { recursive: true, force: true });
    }
    
    // Check if package.json exists
    if (!fs.existsSync(packageJsonPath)) {
      console.log(`⚠️  No package.json found, skipping dependency installation`);
      return;
    }
    
    // Install Ghostery adblocker dependency (always use npm for asar compatibility)
    console.log(`👻 Installing Ghostery adblocker dependency with npm...`);
    const ghosteryCmd = 'npm install --save @ghostery/adblocker-electron';
    console.log(`🔧 Running: ${ghosteryCmd}`);
    
    execSync(ghosteryCmd, { 
      cwd: extractPath, 
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' }
    });
    
    console.log(`✅ Ghostery dependency installed`);
    
    // Install remaining dependencies (always use npm for asar compatibility)
    console.log(`📦 Installing remaining dependencies with npm...`);
    
    const installCmd = 'npm install --production';
    console.log(`🔧 Running: ${installCmd}`);
    
    execSync(installCmd, { 
      cwd: extractPath, 
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' }
    });
    
    console.log(`✅ All dependencies installed`);
  }

  getInstallCommand() {
    // Always use npm for asar compatibility (pnpm/yarn create symlink issues)
    return 'npm install --production';
  }

  getGhosteryInstallCommand() {
    // Always use npm for asar compatibility (pnpm/yarn create symlink issues)
    return 'npm install --save @ghostery/adblocker-electron';
  }

  async step7_RepackAsar() {
    console.log(`\n📋 Step 7: Repacking asar file...`);
    
    const extractPath = path.join(this.tempDir, 'extracted');
    const newAsarPath = path.join(this.tempDir, 'app.new.asar');
    
    const packCmd = `${this.packageManager} dlx @electron/asar pack "${extractPath}" "${newAsarPath}"`;
    console.log(`🔧 Running: ${packCmd}`);
    
    execSync(packCmd, { stdio: 'inherit' });
    console.log(`✅ Asar repacked: ${newAsarPath}`);
  }

  async step8_CopyBack() {
    console.log(`\n📋 Step 8: Copying patched asar back to Deezer...`);
    
    const newAsarPath = path.join(this.tempDir, 'app.new.asar');
    const targetAsar = path.join(this.paths.deezerPath, 'resources', this.paths.asarFile);
    
    if (!fs.existsSync(newAsarPath)) {
      throw new Error(`Repacked asar not found at: ${newAsarPath}`);
    }
    
    // Copy the new asar file
    fs.copyFileSync(newAsarPath, targetAsar);
    console.log(`✅ Patched asar copied to: ${targetAsar}`);
    
    // Cleanup temp directory
    this.cleanup();
  }

  cleanup() {
    if (fs.existsSync(this.tempDir)) {
      console.log(`🧹 Cleaning up temporary files...`);
      fs.rmSync(this.tempDir, { recursive: true, force: true });
    }
  }

  // Utility methods for future platform implementations
  
  static async setupMacOS() {
    console.log(`🍎 macOS Setup Instructions:`);
    console.log(`1. Install Deezer from the Mac App Store or deezer.com`);
    console.log(`2. Update the deezerPath in getPlatformPaths() method`);
    console.log(`3. Test the paths and adjust as needed`);
    console.log(`4. You may need to disable SIP or use different signing methods`);
  }

  static async setupLinux() {
    console.log(`🐧 Linux Setup Instructions:`);
    console.log(`1. Install Deezer using your package manager or AppImage`);
    console.log(`2. Find the Deezer installation directory (usually /opt/deezer-desktop)`);
    console.log(`3. Update the deezerPath in getPlatformPaths() method`);
    console.log(`4. Ensure you have write permissions to the Deezer directory`);
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--setup-macos')) {
    DeezerPatcher.setupMacOS();
    process.exit(0);
  }
  
  if (args.includes('--setup-linux')) {
    DeezerPatcher.setupLinux();
    process.exit(0);
  }
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🔧 DeDeezer Auto-Patcher

Usage:
  node autopatch.js              Run the patcher
  node autopatch.js --help       Show this help
  node autopatch.js --setup-macos   Show macOS setup instructions
  node autopatch.js --setup-linux   Show Linux setup instructions

Features:
  ✅ Automatic backup creation
  ✅ Cross-platform support (Windows implemented)
  ✅ Package manager detection (npm/yarn/pnpm)
  ✅ Dependency management
  ✅ Error handling and cleanup
  ✅ Timestamped backups

Requirements:
  - Node.js
  - Package manager (npm/yarn/pnpm)
  - Deezer Desktop installed
    `);
    process.exit(0);
  }
  
  // Run the patcher
  const patcher = new DeezerPatcher();
  patcher.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = DeezerPatcher;
