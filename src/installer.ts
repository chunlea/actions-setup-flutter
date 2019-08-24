// Load tempDirectory before it gets wiped by tool-cache
let tempDirectory = process.env['RUNNER_TEMPDIRECTORY'] || '';
import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as os from 'os';
import * as path from 'path';
import * as restm from 'typed-rest-client/RestClient';

let osPlat: string = os.platform();
let baseUrl: string = 'https://storage.googleapis.com/flutter_infra/releases/';

if (!tempDirectory) {
  let baseLocation;
  if (process.platform === 'win32') {
    // On windows use the USERPROFILE env variable
    baseLocation = process.env['USERPROFILE'] || 'C:\\';
  } else {
    if (process.platform === 'darwin') {
      baseLocation = '/Users';
    } else {
      baseLocation = '/home';
    }
  }
  tempDirectory = path.join(baseLocation, 'actions', 'temp');
}

interface IFlutterVersion {
  baseUrl: string;
  currentRelease: IFlutterCurrentVersion;
  releases: IFlutterRelease[];
}

interface IFlutterCurrentVersion {
  beta: string;
  dev: string;
  stable: string;
}

interface IFlutterRelease {
  hash: string,
  channel: string,
  version: string,
  releaseDate: string,
  archive: string,
  sha256: string
}

export async function getFlutter(versionSpec: string) {
  // get version spec's hash, and check whether there is a cached version here
  let flutterVersion: IFlutterVersion = await queryFlutterVersion();

  let release = getFlutterRelease(versionSpec, flutterVersion);
  // check cache with flutter version hash

  if (!release) {
    throw new Error(`Can't find flutter version with ${versionSpec}`);
  }

  let toolPath: string;
  toolPath = tc.find('flutter', release.hash);

  // If not found in cache, download
  if (!toolPath) {
    toolPath = await acquireFlutter(release, flutterVersion);
  }

  //
  // a tool installer initimately knows details about the layout of that tool
  // for example, node binary is in the bin folder after the extract on Mac/Linux.
  // layouts could change by version, by platform etc... but that's the tool installers job
  //
  toolPath = path.join(toolPath, 'bin');

  // prepend the tools path. instructs the agent to prepend for future tasks
  core.addPath(toolPath);
}

export async function queryFlutterVersion(): Promise<IFlutterVersion> {
  let dataUrl: string;
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

  let rest: restm.RestClient = new restm.RestClient('setup-flutter');

  let result = await rest.get<IFlutterVersion>(dataUrl);

  if (result.result) {
    return result.result;
  } else {
    throw new Error(`Query Flutter Version from ${dataUrl} failed`);
  }
}

export function getFlutterRelease(versionSpec: string, flutterVersion: IFlutterVersion): IFlutterRelease | undefined {
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

async function acquireFlutter(release: IFlutterRelease, flutterVersion: IFlutterVersion): Promise<string> {
  //
  // Download - a tool installer intimately knows how to get the tool (and construct urls)
  //
  let downloadUrl = `${flutterVersion.baseUrl}/${release.archive}`;

  let downloadPath: string;

  try {
    downloadPath = await tc.downloadTool(downloadUrl);
  } catch (err) {
    // if (err instanceof tc.HTTPError && err.httpStatusCode == 404) {
    //   return await acquireNodeFromFallbackLocation(version);
    // }
    throw err;
  }

  //
  // Extract
  //
  let destPath: string = path.join(__dirname, release.hash);
  let extPath: string = await tc.extractZip(downloadPath, destPath);

  //
  // Install into the local tool cache - node extracts with a root folder that matches the fileName downloaded
  //
  let toolRoot = path.join(extPath);
  return await tc.cacheDir(toolRoot, 'flutter', release.hash);
}
