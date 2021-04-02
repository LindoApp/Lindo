import {Component, NgZone, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {TranslateService} from '@ngx-translate/core';
import {ElectronService as electron} from 'app/core/electron/electron.service';
import {IpcRendererService} from 'app/core/electron/ipcrenderer.service';
import {Subscription} from 'rxjs';
import {Logger} from "app/core/electron/logger.helper";
import {SettingsService} from 'app/core/service/settings.service';
import {js as BeautifyJs, css as BeautifyCss} from 'js-beautify';
import {ProgressBarMode} from "@angular/material/progress-bar";
import axios from 'axios';
import axiosRetry from 'axios-retry';
import {Differences} from "../../interfaces/update/differences";
import {Manifest} from "../../interfaces/update/manifest";
import {Files} from "../../interfaces/update/files";
import {RegexPatches} from "../../interfaces/update/regex-patches";

let axiosClient = axios.create();
axiosRetry(axiosClient, {retries: 10, retryDelay: () => 1000});

const { ConcurrencyManager } = require("axios-concurrency");
const MAX_CONCURRENT_REQUESTS = 10;
const manager = ConcurrencyManager(axiosClient, MAX_CONCURRENT_REQUESTS);

const fs = fsLib;
const path = pathLib;
const httpAdapter = httpAdapterLib;

@Component({
    selector: 'component-official-game-update',
    templateUrl: './official-game-update.component.html',
    styleUrls: ['./official-game-update.component.scss']
})
export class OfficialGameUpdateComponent implements OnInit, OnDestroy {

    /** Assets maps */
    private localAssetMapPath: string;
    private remoteAssetMapPath: string;

    private currentAssetMap: Manifest | any = {};
    private remoteAssetMap: Manifest | any = {};

    private assetMapDifferences: Differences;

    /** Lindo manifest */
    private localLindoManifestPath: string;
    private remoteLindoManifestPath: string;

    private currentLindoManifest: Manifest | any = {};
    private remoteLindoManifest: Manifest | any = {};

    private lindoManifestDifferences: Differences;
    private lindoMissingFiles: Files;

    /** Dofus manifest */
    private localDofusManifestPath: string;
    private remoteDofusManifestPath: string;

    private currentDofusManifest: Manifest | any = {};
    private remoteDofusManifest: Manifest | any = {};

    private dofusManifestDifferences: Differences;
    private dofusMissingFiles: Files;

    /** Version */
    private localVersionsPath: string;
    private localVersions: any;

    /** Regex */
    private localRegexPath: string;
    private localRegex: RegexPatches;

    /** Progress bar */
    public progressMode: ProgressBarMode = "indeterminate";
    public progressValue: number = 0;
    public progressText: string;

    private localGameFolder: string;
    private dofusOrigin: string = this.settingsService.option.general.early ? "https://earlyproxy.touch.dofus.com/" : "https://proxyconnection.touch.dofus.com/";
    private dofusOriginItuneVersion: string = (this.settingsService.option.general.early ? "https://itunes.apple.com/lookup?id=1245534439" : "https://itunes.apple.com/lookup?id=1041406978") + "&t=" + (new Date().getTime())

    private sub: Subscription;

    constructor(
        private route: ActivatedRoute,
        private translate: TranslateService,
        private zone: NgZone,
        private ipcRendererService: IpcRendererService,
        private settingsService: SettingsService
    ) {
    }

    private log(message: any) {
        Logger.info("[UPDATE] " + message);
    }

    ngOnInit() {

        this.translate.get('app.window.update-dofus.information.search').subscribe((sentence: string) => this.progressText = sentence);

        this.sub = this.route.params.subscribe(async params => {

            this.localGameFolder = decodeURIComponent(params['destinationPath']) + "/";
            fs.mkdirSync(this.localGameFolder, {recursive: true});
            fs.mkdirSync(this.localGameFolder + "build", {recursive: true});

            this.localAssetMapPath = this.localGameFolder + "assetMap.json";
            this.remoteAssetMapPath = this.dofusOrigin + "assetMap.json";

            this.localLindoManifestPath = this.localGameFolder + "lindoManifest.json";
            this.remoteLindoManifestPath = "https://raw.githubusercontent.com/Clover-Lindo/lindo-game-base/master/manifest.json";

            this.localDofusManifestPath = this.localGameFolder + "manifest.json";
            this.remoteDofusManifestPath = this.dofusOrigin + "manifest.json";

            this.localVersionsPath = this.localGameFolder + "versions.json";
            this.localRegexPath = this.localGameFolder + "regex.json";

            try {

                this.log("DOWNLOADING ALL MANIFESTS");
                this.translate.get('app.window.update-dofus.step0').subscribe((sentence: string) => this.progressText = sentence);

                this.currentAssetMap = (fs.existsSync(this.localAssetMapPath)) ? JSON.parse(fs.readFileSync(this.localAssetMapPath)) : {};
                this.remoteAssetMap = await this.downloadJson(this.remoteAssetMapPath);
                this.assetMapDifferences = OfficialGameUpdateComponent.differences(this.currentAssetMap, this.remoteAssetMap);

                this.currentLindoManifest = (fs.existsSync(this.localLindoManifestPath)) ? JSON.parse(fs.readFileSync(this.localLindoManifestPath)) : {};
                this.remoteLindoManifest = await this.downloadJson(this.remoteLindoManifestPath);
                this.lindoManifestDifferences = OfficialGameUpdateComponent.differences(this.currentLindoManifest, this.remoteLindoManifest);

                this.currentDofusManifest = (fs.existsSync(this.localDofusManifestPath)) ? JSON.parse(fs.readFileSync(this.localDofusManifestPath)) : {};
                this.remoteDofusManifest = await this.downloadJson(this.remoteDofusManifestPath);
                this.dofusManifestDifferences = OfficialGameUpdateComponent.differences(this.currentDofusManifest, this.remoteDofusManifest);

                this.localVersions = (fs.existsSync(this.localVersionsPath)) ? JSON.parse(fs.readFileSync(this.localVersionsPath)) : {};
                this.localRegex = (fs.existsSync(this.localRegexPath)) ? JSON.parse(fs.readFileSync(this.localRegexPath)) : {};

                this.log("DOWNLOAD MISSING ASSETS FILES ON DISK..");
                this.translate.get('app.window.update-dofus.step1').subscribe((sentence: string) => this.progressText = sentence);
                await this.downloadAssetsFiles();

                this.log("DOWNLOAD MISSING LINDO AND DOFUS FILES IN MEMORY..");
                this.translate.get('app.window.update-dofus.step2').subscribe((sentence: string) => this.progressText = sentence);
                await this.chargingMissingLindoAndDofusFiles();

                this.log("FINDING VERSIONS..");
                this.translate.get('app.window.update-dofus.step3').subscribe((sentence: string) => this.progressText = sentence);
                await this.findingVersions();

                this.log("APPLYING REGEX (LINDO OVERRIDE) ON DOFUS MISSING FILES");
                this.translate.get('app.window.update-dofus.step4').subscribe((sentence: string) => this.progressText = sentence);
                this.applyRegex();

                this.log("WRITING LINDO AND DOFUS MISSING FILES TO DISK");
                this.translate.get('app.window.update-dofus.step5').subscribe((sentence: string) => this.progressText = sentence);
                this.writingMissingLindoAndDofusFiles();

                this.log("REMOVING OLDER ASSETS AND DOFUS FILES..");
                this.translate.get('app.window.update-dofus.step6').subscribe((sentence: string) => this.progressText = sentence);
                this.removeOlderAssetsAndDofusFiles();

                this.log("SAVING ALL JSON FILES TO DISK");
                this.translate.get('app.window.update-dofus.step7').subscribe((sentence: string) => this.progressText = sentence);

                fs.writeFileSync(this.localAssetMapPath, JSON.stringify(this.remoteAssetMap));
                fs.writeFileSync(this.localLindoManifestPath, JSON.stringify(this.remoteLindoManifest));
                fs.writeFileSync(this.localDofusManifestPath, JSON.stringify(this.remoteDofusManifest));
                fs.writeFileSync(this.localVersionsPath, JSON.stringify(this.localVersions));

                this.translate.get('app.window.update-dofus.step8').subscribe((sentence: string) => this.progressText = sentence);
                this.ipcRendererService.send('update-finished', this.localVersions);

            } catch (error) {

                this.translate.get('app.window.update-dofus.information.error').subscribe((sentence: string) => this.progressText = sentence + " (" + error.message + ")");

                LoggerLindo.error(error);
                LoggerLindo.error(error.message);
            }
        });
    }

    private async downloadAssetsFiles() {

        let promises = [];

        for (let i in this.assetMapDifferences) {
            if (this.assetMapDifferences[i] == 1) {

                promises.push(new Promise((resolve, reject) => {

                    let url = this.dofusOrigin + this.remoteAssetMap.files[i].filename;
                    let filePath = this.localGameFolder + this.remoteAssetMap.files[i].filename;

                    let directoryPath = path.dirname(filePath);
                    if (!fs.existsSync(directoryPath)) {
                        fs.mkdirSync(directoryPath, {recursive: true});
                    }

                    axiosClient.get(url, {adapter: httpAdapter, responseType: "stream"}).then((response) => {
                        response.data.pipe(fs.createWriteStream(filePath));
                        resolve(true);
                    });
                }));
            }
        }

        await Promise.all(promises);
    }

    private async chargingMissingLindoAndDofusFiles() {

        let lindoFiles: Files | any = [];
        for (let i in this.lindoManifestDifferences) {
            if (this.lindoManifestDifferences[i] == 1) {
                lindoFiles[i] = await this.downloadJson(this.remoteLindoManifest.files[i].filename);
            }
        }
        this.lindoMissingFiles = lindoFiles;

        /** ---------------------------------------------------- */

        /** Redownload forced if regex has changed */
        if (this.lindoManifestDifferences['regex.json'] == 1) {
            for (let i in this.dofusManifestDifferences) this.dofusManifestDifferences[i] = 1;
        }

        let dofusFiles: Files | any = [];
        for (let i in this.dofusManifestDifferences) {
            if (this.dofusManifestDifferences[i] == 1) {
                dofusFiles[i] = await this.downloadJson(this.dofusOrigin + this.remoteDofusManifest.files[i].filename);
            }
        }
        this.dofusMissingFiles = dofusFiles;
    }

    private async findingVersions() {

        if (this.dofusMissingFiles["build/script.js"]) {

            this.localVersions.buildVersion = (this.dofusMissingFiles["build/script.js"] as string).match(/window\.buildVersion\s?=\s?"(\d+\.\d+\.\d+(?:\-\d+)?)"/)[1];
            this.localVersions.appVersion = await new Promise((resolve) => {
                axios.get(this.dofusOriginItuneVersion).then((response: any) => resolve(response.data.results[0].version));
            });
        }

        this.log("VERSIONS : buildVersion = " + this.localVersions.buildVersion + " - appVersion = " + this.localVersions.appVersion);
    }

    private writingMissingLindoAndDofusFiles() {

        for (let filename in this.lindoMissingFiles) {

            let fileContent: string;
            if (typeof this.lindoMissingFiles[filename] == 'object') {
                fileContent = JSON.stringify(this.lindoMissingFiles[filename]);
            } else {
                fileContent = (this.lindoMissingFiles[filename] as string);
            }

            fs.writeFileSync(this.localGameFolder + filename, fileContent);
        }

        /** ---------------------------------------------------- */

        for (let filename in this.dofusMissingFiles) {

            let fileContent: string;
            if (typeof this.dofusMissingFiles[filename] == 'object') {
                fileContent = JSON.stringify(this.dofusMissingFiles[filename]);
            } else {
                fileContent = (this.dofusMissingFiles[filename] as string);
            }

            fs.writeFileSync(this.localGameFolder + filename, fileContent);
        }
    }

    private removeOlderAssetsAndDofusFiles() {

        for (let i in this.assetMapDifferences) {
            if (this.assetMapDifferences[i] == -1) {

                let filePath = this.localGameFolder + this.remoteAssetMap.files[i].filename;
                let directoryPath = path.dirname(filePath);

                if (fs.existsSync(filePath)) {

                    fs.unlinkSync(filePath);

                    let directory = fs.readdirSync(directoryPath);
                    if (directory.length === 0) fs.rmdirSync(directoryPath);
                }
            }
        }

        /** ---------------------------------------------------- */

        for (let i in this.lindoManifestDifferences) {
            if (this.lindoManifestDifferences[i] == -1) {

                let filePath = this.localGameFolder + this.remoteDofusManifest.files[i].filename;
                let directoryPath = path.dirname(filePath);

                if (fs.existsSync(filePath)) {

                    fs.unlinkSync(filePath);

                    let directory = fs.readdirSync(directoryPath);
                    if (directory.length === 0) fs.rmdirSync(directoryPath);
                }
            }
        }
    }

    private downloadJson(url: string): Promise<any> {

        this.log("Download JSON : " + url);

        return new Promise((resolve, reject) => {

            axios.get(url).then((response: any) => {
                resolve(response.data);
            }).catch((error: any) => {
                reject({});
            });
        });
    }

    private static differences(manifestA: Manifest, manifestB: Manifest): Differences {

        let differences = {};

        if (manifestB && manifestB.files) {
            for (let i in manifestB.files) {
                if (!manifestA || !manifestA.files || !manifestA.files[i] || manifestA.files[i].version != manifestB.files[i].version) {
                    differences[i] = 1;
                } else {
                    differences[i] = 0;
                }
            }
        }

        if (manifestA && manifestA.files) {
            for (let i in manifestA.files) {
                if (!manifestB || !manifestB.files || !manifestB.files[i]) {
                    differences[i] = -1;
                }
            }
        }

        return differences;
    }

    private applyRegex() {

        let regex: RegexPatches;

        if (this.lindoManifestDifferences['regex.json'] == 1) {
            regex = (this.lindoMissingFiles['regex.json'] as RegexPatches);
        } else {
            regex = this.localRegex;
        }

        for (let filename in regex) {

            if (this.dofusMissingFiles[filename]) {

                if (/.js$/.test(filename)) {
                    this.dofusMissingFiles[filename] = BeautifyJs(this.dofusMissingFiles[filename], {"break_chained_methods": true});
                } else if (/.css$/.test(filename)) {
                    this.dofusMissingFiles[filename] = BeautifyCss(this.dofusMissingFiles[filename]);
                }

                for (let i in regex[filename]) {
                    this.dofusMissingFiles[filename] = (this.dofusMissingFiles[filename] as string).replace(new RegExp(regex[filename][i][0], 'g'), regex[filename][i][1]);
                }
            }
        }
    }

    public closeWindow() {
        electron.close();
    }

    ngOnDestroy() {
        this.sub.unsubscribe();
    }

}
