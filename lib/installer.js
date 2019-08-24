"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
// Load tempDirectory before it gets wiped by tool-cache
let tempDirectory = process.env['RUNNER_TEMPDIRECTORY'] || '';
const core = __importStar(require("@actions/core"));
const tc = __importStar(require("@actions/tool-cache"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const restm = __importStar(require("typed-rest-client/RestClient"));
let osPlat = os.platform();
let baseUrl = 'https://storage.googleapis.com/flutter_infra/releases/';
if (!tempDirectory) {
    let baseLocation;
    if (process.platform === 'win32') {
        // On windows use the USERPROFILE env variable
        baseLocation = process.env['USERPROFILE'] || 'C:\\';
    }
    else {
        if (process.platform === 'darwin') {
            baseLocation = '/Users';
        }
        else {
            baseLocation = '/home';
        }
    }
    tempDirectory = path.join(baseLocation, 'actions', 'temp');
}
function getFlutter(versionSpec) {
    return __awaiter(this, void 0, void 0, function* () {
        // get version spec's hash, and check whether there is a cached version here
        let flutterVersion = yield queryFlutterVersion();
        let release = getFlutterRelease(versionSpec, flutterVersion);
        // check cache with flutter version hash
        if (!release) {
            throw new Error(`Can't find flutter version with ${versionSpec}`);
        }
        let toolPath;
        toolPath = tc.find('flutter', release.hash);
        // If not found in cache, download
        if (!toolPath) {
            toolPath = yield acquireFlutter(release, flutterVersion);
        }
        //
        // a tool installer initimately knows details about the layout of that tool
        // for example, node binary is in the bin folder after the extract on Mac/Linux.
        // layouts could change by version, by platform etc... but that's the tool installers job
        //
        toolPath = path.join(toolPath, 'bin');
        // prepend the tools path. instructs the agent to prepend for future tasks
        core.addPath(toolPath);
    });
}
exports.getFlutter = getFlutter;
function queryFlutterVersion() {
    return __awaiter(this, void 0, void 0, function* () {
        let dataUrl;
        switch (osPlat) {
            case 'linux':
                dataUrl = baseUrl + 'releases_linux.json';
                break;
            case 'darwin':
                dataUrl = baseUrl + 'releases_macos.json';
                break;
            case 'win32':
                dataUrl = baseUrl + 'releases_windows.json';
                break;
            default:
                throw new Error(`Unexpected OS '${osPlat}'`);
        }
        let rest = new restm.RestClient('setup-flutter');
        let result = yield rest.get(dataUrl);
        if (result.result) {
            return result.result;
        }
        else {
            throw new Error(`Query Flutter Version from ${dataUrl} failed`);
        }
    });
}
exports.queryFlutterVersion = queryFlutterVersion;
function getFlutterRelease(versionSpec, flutterVersion) {
    console.debug(flutterVersion);
    switch (versionSpec) {
        case 'stable':
            return flutterVersion.releases.find(release => release.hash == flutterVersion.currentRelease.stable);
        case 'beta':
            return flutterVersion.releases.find(release => release.hash == flutterVersion.currentRelease.beta);
        case 'dev':
            return flutterVersion.releases.find(release => release.hash == flutterVersion.currentRelease.dev);
        default:
            return flutterVersion.releases.find(release => release.version == versionSpec);
    }
}
exports.getFlutterRelease = getFlutterRelease;
function acquireFlutter(release, flutterVersion) {
    return __awaiter(this, void 0, void 0, function* () {
        //
        // Download - a tool installer intimately knows how to get the tool (and construct urls)
        //
        let downloadUrl = `${flutterVersion.baseUrl}/${release.archive}`;
        let downloadPath;
        try {
            downloadPath = yield tc.downloadTool(downloadUrl);
        }
        catch (err) {
            // if (err instanceof tc.HTTPError && err.httpStatusCode == 404) {
            //   return await acquireNodeFromFallbackLocation(version);
            // }
            throw err;
        }
        //
        // Extract
        //
        let destPath = path.join(__dirname, release.hash);
        let extPath = yield tc.extractZip(downloadPath, destPath);
        //
        // Install into the local tool cache - node extracts with a root folder that matches the fileName downloaded
        //
        let toolRoot = path.join(extPath);
        return yield tc.cacheDir(toolRoot, 'flutter', release.hash);
    });
}
