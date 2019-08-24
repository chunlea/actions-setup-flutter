import * as core from '@actions/core';
import * as installer from './installer';

async function run() {
  try {
    let version = core.getInput('version');
    if (!version) {
      version = core.getInput('flutter-version');
    }

    if (version) {
      await installer.getFlutter(version);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
