/**
 * Script for landing.ejs
 */

// Requirements
const cp                      = require('child_process')
const crypto                  = require('crypto')
const {URL}                   = require('url')
const {Remarkable}            = require('remarkable')
const fs                      = require('fs-extra')
const chokidar                = require('chokidar')

// Internal Requirements
const DiscordWrapper          = require('./assets/js/discordwrapper')
const Mojang                  = require('./assets/js/mojang')
const ModRealmsRest           = require('./assets/js/modrealms')
const ProcessBuilder          = require('./assets/js/processbuilder')
const ServerStatus            = require('./assets/js/serverstatus')

// Launch Elements
const launch_content          = document.getElementById('launch_content')
const launch_details          = document.getElementById('launch_details')
const launch_progress         = document.getElementById('launch_progress')
const launch_progress_label   = document.getElementById('launch_progress_label')
const launch_details_text     = document.getElementById('launch_details_text')
const server_selection_button = document.getElementById('server_selection_button')
const user_text               = document.getElementById('user_text')

const loggerLanding = LoggerUtil('%c[Landing]', 'color: #000668; font-weight: bold')
const loggerAEx = LoggerUtil('%c[AEx]', 'color: #353232; font-weight: bold')
const loggerLaunchSuite = LoggerUtil('%c[LaunchSuite]', 'color: #000668; font-weight: bold')
const loggerMetrics = LoggerUtil('%c[ModRealms Metrics]', 'color: #7289da; font-weight: bold')

/* Launch Progress Wrapper Functions */

/**
 * Show/hide the loading area.
 * 
 * @param {boolean} loading True if the loading area should be shown, otherwise false.
 */
function toggleLaunchArea(loading){
    if(loading){
        launch_details.style.display = 'flex'
        launch_content.style.display = 'none'
    } else {
        launch_details.style.display = 'none'
        launch_content.style.display = 'inline-flex'
    }
}

/**
 * Set the details text of the loading area.
 * 
 * @param {string} details The new text for the loading details.
 */
function setLaunchDetails(details){
    launch_details_text.innerHTML = details
}

/**
 * Set the value of the loading progress bar and display that value.
 * 
 * @param {number} value The progress value.
 * @param {number} max The total size.
 * @param {number|string} percent Optional. The percentage to display on the progress label.
 */
function setLaunchPercentage(value, max, percent = ((value/max)*100)){
    launch_progress.setAttribute('max', max)
    launch_progress.setAttribute('value', value)
    launch_progress_label.innerHTML = percent + '%'
}

/**
 * Set the value of the OS progress bar and display that on the UI.
 * 
 * @param {number} value The progress value.
 * @param {number} max The total download size.
 * @param {number|string} percent Optional. The percentage to display on the progress label.
 */
function setDownloadPercentage(value, max, percent = ((value/max)*100)){
    remote.getCurrentWindow().setProgressBar(value/max)
    setLaunchPercentage(value, max, percent)
    DiscordWrapper.updateDetails('Téléchargement... (' + percent + '%)')
}

/**
 * Enable or disable the launch button.
 * 
 * @param {boolean} val True to enable, false to disable.
 */
function setLaunchEnabled(val){
    document.getElementById('launch_button').disabled = !val
}

/**
 * Enable or disable the launch button.
 *
 * @param {string} the text to set the launch button to.
 */
function setLaunchButtonText(text){
    document.getElementById('launch_button').innerHTML = text
}

// Bind launch button
document.getElementById('launch_button').addEventListener('click', function(e){
    if(checkCurrentServer(true)){
        if(ConfigManager.getConsoleOnLaunch()){
            let window = remote.getCurrentWindow()
            window.toggleDevTools()
        }

        loggerLanding.log('Launching game..')
        const mcVersion = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer()).getMinecraftVersion()
        const jExe = ConfigManager.getJavaExecutable()
        if(jExe == null){
            asyncSystemScan(mcVersion)
        } else {

            setLaunchDetails(Lang.queryJS('landing.launch.pleaseWait'))
            toggleLaunchArea(true)
            setLaunchPercentage(0, 100)

            const jg = new JavaGuard(mcVersion)
            jg._validateJavaBinary(jExe).then((v) => {
                loggerLanding.log('Java version meta', v)
                if(v.valid){
                    dlAsync()
                } else {
                    asyncSystemScan(mcVersion)
                }
            })
        }
    }
})

// Bind settings button
document.getElementById('settingsMediaButton').onclick = (e) => {
    prepareSettings()
    switchView(getCurrentView(), VIEWS.settings)
    if(hasRPC){
        DiscordWrapper.updateDetails('Dans les paramètres...')
        DiscordWrapper.clearState()
    }
}

document.getElementById('openInstanceMediaButton').onclick = (e) => {
    let INSTANCE_PATH = path.join(ConfigManager.getDataDirectory(), 'instances', ConfigManager.getSelectedServer())
    let INSTANCES_PATH = path.join(ConfigManager.getDataDirectory(), 'instances')
    if(ConfigManager.getSelectedServer() && fs.pathExistsSync(INSTANCE_PATH)){
        shell.openPath(INSTANCE_PATH)
    } else if (fs.pathExistsSync(INSTANCES_PATH)){
        shell.openPath(INSTANCES_PATH)
    } else {
        shell.openPath(ConfigManager.getDataDirectory())
    }
}

document.getElementById('refreshMediaButton').onclick = (e) => {
    let ele = document.getElementById('refreshMediaButton')
    ele.setAttribute('inprogress', '')
    DistroManager.pullRemote().then((data) => {
        onDistroRefresh(data)
        showMainUI(data)
        //refreshModRealmsStatuses()
        setOverlayContent(
            'Launcher rafraîchi!',
            'Ceci est une confirmation vous indiquant que vous avez rafraîchi manuellement votre launcher, votre liste de serveurs est maintenant à jour! Si vous avez des problèmes s\'il vous plaît faites-le nous savoir!',
            'Super! Merci.',
            'Rejoindre notre Discord'
        )
    }).catch(err => {
        setOverlayContent(
            'Error Refreshing Distribution',
            'We were unable to grab the latest server information from the internet upon startup, so we have used a previously stored version instead.<br><br>This is not recommended, and you should restart your client to fix this to avoid your modpack files being out of date. If you wish to continue using the launcher, you can try again at any time by pressing the refresh button on the landing screen.<br><br>If this continues to occur, and you are not too sure why, come and see us on Discord!<br><br>Error Code:<br>' + err,
            'Understood.',
            'Join our Discord'
        )
    }).finally(() => {
        setOverlayHandler(() => {
            toggleOverlay(false)
        })
        setDismissHandler(() => {
            shell.openExternal('https://discord.gg/dymensia')
        })
        toggleOverlay(true, true)
        ele.removeAttribute('inprogress')
    })
}

// Bind avatar overlay button.
document.getElementById('avatarOverlay').onclick = (e) => {
    prepareSettings()
    switchView(getCurrentView(), VIEWS.settings, 250, 250, () => {
        settingsNavItemListener(document.getElementById('settingsNavAccount'), false)
    })
}

// Bind selected account
function updateSelectedAccount(authUser){
    let username = 'Aucun compte sélectionné'
    if(authUser != null){
        if(authUser.displayName != null){
            username = authUser.displayName
        }
        if(authUser.uuid != null){
            document.getElementById('avatarContainer').style.backgroundImage = `url('https://crafatar.com/renders/body/${authUser.uuid}?default=MHF_Steve&overlay')`
        }
    }
    user_text.innerHTML = username
}
updateSelectedAccount(ConfigManager.getSelectedAccount())

function randomiseBackground() {
    let backgroundDir = fs.readdirSync(path.join(__dirname, 'assets', 'images', 'backgrounds'))
    const backgrounds = Array.from(backgroundDir.values())
    const bkid = backgrounds[Math.floor((Math.random() * backgroundDir.length))]
    document.body.style.backgroundImage = `url('assets/images/backgrounds/${bkid}')`
}

// Bind selected server
function updateSelectedServer(serv){
    server_selection_button.innerHTML = (serv != null ? serv.getName() : 'No Server Selected')
    if(getCurrentView() === VIEWS.settings){
        saveAllModConfigurations()
    }
    ConfigManager.setSelectedServer(serv != null ? serv.getID() : null)
    ConfigManager.save()
    if(getCurrentView() === VIEWS.settings){
        animateModsTabRefresh()
    }
    setLaunchEnabled(serv != null)
    if(serv){
        setLaunchButtonText(fs.pathExistsSync(path.join(ConfigManager.getDataDirectory(), 'instances', serv.getID())) ? 'JOUER' : 'INSTALLER & JOUER')
    } else {
        setLaunchButtonText('JOUER')
    }

}
// Real text is set in uibinder.js on distributionIndexDone.
server_selection_button.innerHTML = '\u2022 Chargement..'
server_selection_button.onclick = (e) => {
    e.target.blur()
    toggleServerSelection(true)
}

// Update Mojang Status Color
const refreshMojangStatuses = async function(){
    loggerLanding.log('Actualisation des statuts Mojang..')

    let status = 'grey'
    let tooltipEssentialHTML = ''
    let tooltipNonEssentialHTML = ''

    try {
        const statuses = await Mojang.status()
        greenCount = 0
        greyCount = 0

        for(let i=0; i<statuses.length; i++){
            const service = statuses[i]

            if(service.essential){
                tooltipEssentialHTML += `<div class="mojangStatusContainer">
                    <span class="mojangStatusIcon" style="color: ${Mojang.statusToHex(service.status)};">&#8226;</span>
                    <span class="mojangStatusName">${service.name}</span>
                </div>`
            } else {
                tooltipNonEssentialHTML += `<div class="mojangStatusContainer">
                    <span class="mojangStatusIcon" style="color: ${Mojang.statusToHex(service.status)};">&#8226;</span>
                    <span class="mojangStatusName">${service.name}</span>
                </div>`
            }

            if(service.status === 'yellow' && status !== 'red'){
                status = 'yellow'
            } else if(service.status === 'red'){
                status = 'red'
            } else {
                if(service.status === 'grey'){
                    ++greyCount
                }
                ++greenCount
            }

        }

        if(greenCount === statuses.length){
            if(greyCount === statuses.length){
                status = 'grey'
            } else {
                status = 'green'
            }
        }

    } catch (err) {
        loggerLanding.warn('Impossible d\'actualiser l\'état du service Mojang.')
        loggerLanding.debug(err)
    }
    
    document.getElementById('mojangStatusEssentialContainer').innerHTML = tooltipEssentialHTML
    document.getElementById('mojangStatusNonEssentialContainer').innerHTML = tooltipNonEssentialHTML
    document.getElementById('mojang_status_icon').style.color = Mojang.statusToHex(status)
}

const refreshModRealmsStatuses = async function(){
    loggerLanding.log('Refreshing Dymensia Statuses..')
    let status = 'grey'
    let tooltipServerHTML = ''
    let greenCount = 0

    // let modpacks = await ModRealmsRest.modpacks()
    // let statuses = await ModRealmsRest.status()

    ModRealmsRest.modpacks().then(modpacks => {
        ModRealmsRest.status().then(statuses => {
            if(modpacks.length !== 0){
                for(let i=0; i<statuses.length; i++){
                    const server = statuses[i]
                    const players = server.isOffline() ? 'Redémarre' : `${server.players}/${server.maxPlayers}`
                    tooltipServerHTML += `<div class="modrealmsStatusContainer">
                    <span class="modrealmsStatusIcon" style="color: ${Mojang.statusToHex(server.status)};">&#8226;</span>
                    <span class="modrealmsStatusName">${server.name}</span>
                    <span class="modrealmsStatusPlayers">${players}</span>
                </div>`

                    if(server.status.toLowerCase() === 'green') ++greenCount
                }

                if(greenCount === 0){
                    status = 'red'
                } else {
                    status = 'green'
                }
            } else {
                tooltipServerHTML = `<div class="modrealmsStatusContainer">
                    <span class="modrealmsStatusName" style="text-align: center;">Désolé! Il n’y a pas de modpacks disponibles!</span>
                </div>`
            }

            document.getElementById('modrealmsStatusServerContainer').innerHTML = tooltipServerHTML
            document.getElementById('modrealms_status_icon').style.color = Mojang.statusToHex(status)
        })
    })
}

const refreshServerStatus = async function(fade = false){
    loggerLanding.log('Refreshing Server Status')
    const serv = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer())

    let pLabel = 'SERVEUR'
    let pVal = 'HORS-LINE'

    try {
        const serverURL = new URL('my://' + serv.getAddress())
        const servStat = await ServerStatus.getStatus(serverURL.hostname, serverURL.port)
        if(servStat.online){
            pLabel = 'JOUEURS'
            try {
                DiscordWrapper.updateParty(servStat.onlinePlayers, servStat.maxPlayers)
            } catch(err) {
                
            }
            pVal = servStat.onlinePlayers + '/' + servStat.maxPlayers
        }

    } catch (err) {
        loggerLanding.warn('Unable to refresh server status, assuming offline.')
        loggerLanding.debug(err)
    }
    if(fade){
        $('#server_status_wrapper').fadeOut(150, () => {
            document.getElementById('landingPlayerLabel').innerHTML = pLabel
            document.getElementById('player_count').innerHTML = pVal
            $('#server_status_wrapper').fadeIn(250)
        })
    } else {
        document.getElementById('landingPlayerLabel').innerHTML = pLabel
        document.getElementById('player_count').innerHTML = pVal
    }
    
}

function loadDiscord(){
    if(!ConfigManager.getDiscordIntegration()) return
    const distro = DistroManager.getDistribution()
    if(!hasRPC){
        if(distro.discord != null){
            DiscordWrapper.initRPC(distro.discord, null, '...')
            hasRPC = true
        }
    }
}

refreshMojangStatuses()
//refreshModRealmsStatuses()
// Server Status is refreshed in uibinder.js on distributionIndexDone.

// Set refresh rate to once every 5 minutes.
let mojangStatusListener = setInterval(() => refreshMojangStatuses(true), 30000)
//let networkStatusListener = setInterval(() => refreshModRealmsStatuses(true), 30000)
let serverStatusListener = setInterval(() => refreshServerStatus(true), 30000)

/**
 * Shows an error overlay, toggles off the launch area.
 * 
 * @param {string} title The overlay title.
 * @param {string} desc The overlay description.
 */
function showLaunchFailure(title, desc){
    setOverlayContent(
        title,
        desc,
        'OK'
    )
    setOverlayHandler(null)
    toggleOverlay(true)
    toggleLaunchArea(false)
}

/* System (Java) Scan */

let sysAEx
let scanAt

let extractListener

/**
 * Asynchronously scan the system for valid Java installations.
 * 
 * @param {string} mcVersion The Minecraft version we are scanning for.
 * @param {boolean} launchAfter Whether we should begin to launch after scanning. 
 */
function asyncSystemScan(mcVersion, launchAfter = true){

    setLaunchDetails('Please wait..')
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const loggerSysAEx = LoggerUtil('%c[SysAEx]', 'color: #353232; font-weight: bold')

    const forkEnv = JSON.parse(JSON.stringify(process.env))
    forkEnv.CONFIG_DIRECT_PATH = ConfigManager.getLauncherDirectory()

    // Fork a process to run validations.
    sysAEx = cp.fork(path.join(__dirname, 'assets', 'js', 'assetexec.js'), [
        'JavaGuard',
        mcVersion
    ], {
        env: forkEnv,
        stdio: 'pipe'
    })
    // Stdout
    sysAEx.stdio[1].setEncoding('utf8')
    sysAEx.stdio[1].on('data', (data) => {
        loggerSysAEx.log(data)
    })
    // Stderr
    sysAEx.stdio[2].setEncoding('utf8')
    sysAEx.stdio[2].on('data', (data) => {
        loggerSysAEx.log(data)
    })
    
    sysAEx.on('message', (m) => {

        if(m.context === 'validateJava'){
            if(m.result == null){
                // If the result is null, no valid Java installation was found.
                // Show this information to the user.
                setOverlayContent(
                    'Aucune installation<br>Java compatible trouvée',
                    'Pour rejoindre Dymensia, vous avez besoin d\'une installation 64 bits de Java 8. Souhaitez-vous que nous en installions une copie? En installant, vous acceptez<a href="http://www.oracle.com/technetwork/java/javase/terms/license/index.html">le contrat de licence d\'Oracle</a>.',
                    'Installer Java',
                    'Installer manuellement'
                )
                setOverlayHandler(() => {
                    setLaunchDetails('Préparation du téléchargement Java..')
                    sysAEx.send({task: 'changeContext', class: 'AssetGuard', args: [ConfigManager.getCommonDirectory(),ConfigManager.getJavaExecutable()]})
                    sysAEx.send({task: 'execute', function: '_enqueueOpenJDK', argsArr: [ConfigManager.getDataDirectory()]})
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    $('#overlayContent').fadeOut(150, () => {
                        //$('#overlayDismiss').toggle(false)
                        setOverlayContent(
                            'Java est nécessaire<br>pour lancer',
                            'Une installation x64 valide de Java 8 est requise pour lancer.<br><br>Veuillez vous référer à notre <a href="https://github.com/dscalzi/HeliosLauncher/wiki/Java-Management#manually-installing-a-valid-version-of-java">guide de gestion Java</a> pour savoir comment installer manuellement Java.',
                            'J\'ai Compris',
                            'Retour'
                        )
                        setOverlayHandler(() => {
                            toggleLaunchArea(false)
                            toggleOverlay(false)
                        })
                        setDismissHandler(() => {
                            toggleOverlay(false, true)
                            asyncSystemScan()
                        })
                        $('#overlayContent').fadeIn(150)
                    })
                })
                toggleOverlay(true, true)

            } else {
                // Java installation found, use this to launch the game.
                ConfigManager.setJavaExecutable(m.result)
                ConfigManager.save()

                // We need to make sure that the updated value is on the settings UI.
                // Just incase the settings UI is already open.
                settingsJavaExecVal.value = m.result
                populateJavaExecDetails(settingsJavaExecVal.value)

                if(launchAfter){
                    dlAsync()
                }
                sysAEx.disconnect()
            }
        } else if(m.context === '_enqueueOpenJDK'){

            if(m.result === true){

                // Oracle JRE enqueued successfully, begin download.
                setLaunchDetails('Téléchargement de Java..')
                sysAEx.send({task: 'execute', function: 'processDlQueues', argsArr: [[{id:'java', limit:1}]]})

            } else {

                // Oracle JRE enqueue failed. Probably due to a change in their website format.
                // User will have to follow the guide to install Java.
                setOverlayContent(
                    'Problème inattendu:<br>Le téléchargement Java a échoué',
                    'Malheureusement, nous avons rencontré un problème lors de la tentative d \'installation de Java. Vous devrez installer manuellement une copie. Veuillez consulter notre <a href="https://github.com/dscalzi/HeliosLauncher/wiki">Guide de dépannage</a> pour plus de détails et d\'instructions.',
                    'J\'ai Compris'
                )
                setOverlayHandler(() => {
                    toggleOverlay(false)
                    toggleLaunchArea(false)
                })
                toggleOverlay(true)
                sysAEx.disconnect()

            }

        } else if(m.context === 'progress'){

            switch(m.data){
                case 'download':
                    // Downloading..
                    setDownloadPercentage(m.value, m.total, m.percent)
                    break
            }

        } else if(m.context === 'complete'){

            switch(m.data){
                case 'download': {
                    // Show installing progress bar.
                    remote.getCurrentWindow().setProgressBar(2)

                    // Wait for extration to complete.
                    const eLStr = 'Extraction'
                    let dotStr = ''
                    setLaunchDetails(eLStr)
                    extractListener = setInterval(() => {
                        if(dotStr.length >= 3){
                            dotStr = ''
                        } else {
                            dotStr += '.'
                        }
                        setLaunchDetails(eLStr + dotStr)
                    }, 750)
                    break
                }
                case 'java':
                // Download & extraction complete, remove the loading from the OS progress bar.
                    remote.getCurrentWindow().setProgressBar(-1)

                    // Extraction completed successfully.
                    ConfigManager.setJavaExecutable(m.args[0])
                    ConfigManager.save()

                    if(extractListener != null){
                        clearInterval(extractListener)
                        extractListener = null
                    }

                    setLaunchDetails('Java installé!')

                    if(launchAfter){
                        dlAsync()
                    }

                    sysAEx.disconnect()
                    break
            }

        } else if(m.context === 'error'){
            console.log(m.error)
        }
    })

    // Begin system Java scan.
    setLaunchDetails('Vérification des informations système..')
    sysAEx.send({task: 'execute', function: 'validateJava', argsArr: [ConfigManager.getDataDirectory()]})

}

// Keep reference to Minecraft Process
let proc
// Is DiscordRPC enabled
let hasRPC = false
// Change this if your server uses something different.
const GAME_JOINED_REGEX = /\[.+\]: Sound engine started/
const GAME_LAUNCH_REGEX = /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+)$/
const MIN_LINGER = 5000

let aEx
let serv
let versionData
let forgeData

let progressListener

function dlAsync(login = true){

    // Login parameter is temporary for debug purposes. Allows testing the validation/downloads without
    // launching the game.

    if(login) {
        if(ConfigManager.getSelectedAccount() == null){
            loggerLanding.error('Vous devez être connecté à un compte.')
            return
        }
    }

    setLaunchDetails('Veuillez patienter..')
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const forkEnv = JSON.parse(JSON.stringify(process.env))
    forkEnv.CONFIG_DIRECT_PATH = ConfigManager.getLauncherDirectory()

    // Start AssetExec to run validations and downloads in a forked process.
    aEx = cp.fork(path.join(__dirname, 'assets', 'js', 'assetexec.js'), [
        'AssetGuard',
        ConfigManager.getCommonDirectory(),
        ConfigManager.getJavaExecutable()
    ], {
        env: forkEnv,
        stdio: 'pipe'
    })
    // Stdout
    aEx.stdio[1].setEncoding('utf8')
    aEx.stdio[1].on('data', (data) => {
        loggerAEx.log(data)
    })
    // Stderr
    aEx.stdio[2].setEncoding('utf8')
    aEx.stdio[2].on('data', (data) => {
        loggerAEx.log(data)
    })
    aEx.on('error', (err) => {
        loggerLaunchSuite.error('Erreur lors du lancement', err)
        showLaunchFailure('Erreur lors du lancement', err.message || 'Voir la console (CTRL + Shift + i) pour plus de détails.')
    })
    aEx.on('close', (code, signal) => {
        if(code !== 0){
            loggerLaunchSuite.error(`AssetExec est sorti avec le code ${code}, supposant une erreur.`)
            showLaunchFailure('Erreur lors du lancement', 'Voir la console (CTRL + Shift + i) pour plus de détails.')
        }
    })

    // Establish communications between the AssetExec and current process.
    aEx.on('message', (m) => {

        if(m.context === 'validate'){
            switch(m.data){
                case 'distribution':
                    setLaunchPercentage(20, 100)
                    loggerLaunchSuite.log('Validated distibution index.')
                    setLaunchDetails('Chargement des informations de version..')
                    break
                case 'version':
                    setLaunchPercentage(40, 100)
                    loggerLaunchSuite.log('Version data loaded.')
                    setLaunchDetails('Validation de l\'intégrité des assets..')
                    break
                case 'assets':
                    setLaunchPercentage(60, 100)
                    loggerLaunchSuite.log('Asset Validation Complete')
                    setLaunchDetails('Validation de l\'intégrité de la bibliothèque..')
                    break
                case 'libraries':
                    setLaunchPercentage(80, 100)
                    loggerLaunchSuite.log('Library validation complete.')
                    setLaunchDetails('Validation de l\'intégrité des fichiers divers..')
                    break
                case 'files':
                    setLaunchPercentage(100, 100)
                    loggerLaunchSuite.log('File validation complete.')
                    setLaunchDetails('Téléchargement de fichiers..')
                    break
            }
        } else if(m.context === 'progress'){
            switch(m.data){
                case 'assets': {
                    const perc = (m.value/m.total)*20
                    setLaunchPercentage(40+perc, 100, parseInt(40+perc))
                    break
                }
                case 'download':
                    setDownloadPercentage(m.value, m.total, m.percent)
                    break
                case 'extract': {
                    // Show installing progress bar.
                    remote.getCurrentWindow().setProgressBar(2)

                    // Download done, extracting.
                    const eLStr = 'Extraction de bibliothèques'
                    let dotStr = ''
                    setLaunchDetails(eLStr)
                    progressListener = setInterval(() => {
                        if(dotStr.length >= 3){
                            dotStr = ''
                        } else {
                            dotStr += '.'
                        }
                        setLaunchDetails(eLStr + dotStr)
                    }, 750)
                    break
                }
            }
        } else if(m.context === 'complete'){
            switch(m.data){
                case 'download':
                    // Download and extraction complete, remove the loading from the OS progress bar.
                    remote.getCurrentWindow().setProgressBar(-1)
                    if(progressListener != null){
                        clearInterval(progressListener)
                        progressListener = null
                    }

                    setLaunchDetails('Préparation du lancement..')
                    break
            }
        } else if(m.context === 'error'){
            switch(m.data){
                case 'download':
                    loggerLaunchSuite.error('Error while downloading:', m.error)
                    if(m.error.code === 'ENOENT'){
                        showLaunchFailure(
                            'Erreur de téléchargement',
                            'Impossible de se connecter au serveur de fichiers. Assurez-vous que vous êtes connecté à Internet et réessayez.'
                        )
                    } else {
                        showLaunchFailure(
                            'Erreur de téléchargement',
                            'Voir la console (CTRL + Shift + i) pour plus de détails. Veuillez réessayer.'
                        )
                    }

                    remote.getCurrentWindow().setProgressBar(-1)

                    // Disconnect from AssetExec
                    aEx.disconnect()
                    break
            }
        } else if(m.context === 'validateEverything'){

            let allGood = true

            // If these properties are not defined it's likely an error.
            if(m.result.forgeData == null || m.result.versionData == null){
                loggerLaunchSuite.error('Error during validation:', m.result)

                loggerLaunchSuite.error('Error during launch', m.result.error)
                showLaunchFailure('Erreur lors du lancement', 'Voir la console (CTRL + Shift + i) pour plus de détails.')

                allGood = false
            }

            forgeData = m.result.forgeData
            versionData = m.result.versionData

            if(login && allGood) {
                updateSelectedServer(DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer()))
                const authUser = ConfigManager.getSelectedAccount()
                loggerLaunchSuite.log(`Sending selected account (${authUser.displayName}) to ProcessBuilder.`)
                let pb = new ProcessBuilder(serv, versionData, forgeData, authUser, remote.app.getVersion())
                setLaunchDetails('Lancement du jeu..')
                const SERVER_JOINED_REGEX = new RegExp(`\\[.+\\]: \\[CHAT\\] ${authUser.displayName} has joined!`)
                const SERVER_LEAVE_REGEX = new RegExp(`\\[.+\\]: \\[CHAT\\] ${authUser.displayName} has left!`)

                const onLoadComplete = () => {
                    toggleLaunchArea(false)
                    if(hasRPC){
                        DiscordWrapper.updateDetails('Chargement du jeu..')
                        DiscordWrapper.resetTime()
                    }
                    gameCrashReportListener()
                    proc.stdout.on('data', gameStateChange)
                    proc.stdout.removeListener('data', tempListener)
                    proc.stdout.removeListener('data', gameLaunchErrorListener)
                }
                const start = Date.now()

                // Attach a temporary listener to the client output.
                // Will wait for a certain bit of text meaning that
                // the client application has started, and we can hide
                // the progress bar stuff.
                const tempListener = function(data){
                    data = data.trim()
                    if(GAME_LAUNCH_REGEX.test(data)){
                        const diff = Date.now()-start
                        if(diff < MIN_LINGER) {
                            setTimeout(onLoadComplete, MIN_LINGER-diff)
                        } else {
                            onLoadComplete()
                        }
                    }
                }

                // Listener for Discord RPC.
                const gameStateChange = function(data){
                    data = data.trim()
                    if(SERVER_JOINED_REGEX.test(data)){
                        DiscordWrapper.updateDetails('En train de jouer')
                        DiscordWrapper.resetTime()
                    }
                }

                // Listener for Discord RPC.
                const gameCrashReportListener = function(){
                    const watcher = chokidar.watch(path.join(ConfigManager.getInstanceDirectory(), serv.getID(), 'crash-reports'), {
                        persistent: true,
                        ignoreInitial: true
                    })

                    watcher.on('add', path => {
                        shell.showItemInFolder(path)
                        setOverlayContent(
                            'Le jeu a crash!',
                            'Oh Oh! On dirait que votre jeu vient de crash. Nous avons ouvert le dossier des rapports de crashs afin que vous puissiez facilement le partager avec notre équipe sur Discord. Si vous avez des crashs répétées, nous vous recommandons toujours de venir nous voir sur <a href="https://discord.gg/dymensia">Discord!</a><br><br>Pour une référence future, l’emplacement du fichier de rapport de plantage est: <br>' + path,
                            'OK, merci!',
                            'Ouvrir le rapport de crash'
                        )
                        setOverlayHandler(() => {
                            toggleOverlay(false)
                        })
                        setDismissHandler(() => {
                            shell.openPath(path)
                        })
                        toggleOverlay(true, true)
                    })
                }

                const gameLaunchErrorListener = function(data){
                    data = data.trim()
                    if(data.indexOf('Could not find or load main class net.minecraft.launchwrapper.Launch') > -1){
                        loggerLaunchSuite.error('Game launch failed, LaunchWrapper was not downloaded properly.')
                        showLaunchFailure('Error During Launch', 'The main file, LaunchWrapper, failed to download properly. As a result, the game cannot launch.<br><br>To fix this issue, temporarily turn off your antivirus software and launch the game again.<br><br>If you have time, please <a href="https://github.com/ModRealms-Network/ModRealmsLauncher/issues">submit an issue</a> and let us know what antivirus software you use. We\'ll contact them and try to straighten things out.')
                        proc.kill(9)
                    }  else if(data.includes('net.minecraftforge.fml.relauncher.FMLSecurityManager$ExitTrappedException')){
                        loggerLaunchSuite.error('Game launch failed before the JVM could open the window!')
                        let LOG_FILE = path.join(ConfigManager.getInstanceDirectory(), serv.getID(), 'logs', 'latest.log')
                        setOverlayContent(
                            'Erreur pendant le lancement!',
                            'Il semble que votre client n’a pas été en mesure de lancer au-delà du point où le client s’ouvre et les rapports de plantage peuvent être générés. Une cause commune de cela peut être une colision entre les mods au début du lancement.<br><br>Si vous avez installé des mods personnalisés, désactivez-les et réessayez de les lancer.<br><br>Si ce problème persiste, veuillez télécharger votre latest.log dans un <a href="https://ptero.co">pastebin</a> et laissez-le nous sur notre serveur <a href="https://discord.gg/dymensia">Discord</a> !',
                            'OK, merci!',
                            'Ouvrir latest.log'
                        )
                        setOverlayHandler(() => {
                            toggleOverlay(false)
                        })
                        setDismissHandler(() => {
                            shell.openPath(LOG_FILE)
                        })
                        toggleOverlay(true, true)
                        toggleLaunchArea(false)
                        proc.kill(9)
                    }
                }

                try {
                    // Build Minecraft process.
                    proc = pb.build()

                    // Bind listeners to stdout.
                    proc.stdout.on('data', tempListener)
                    proc.stdout.on('data', gameLaunchErrorListener)

                    setLaunchDetails('Your modpack is now launching...<br>Enjoy the server!')
                    proc.on('close', (code, signal) => {
                        if(hasRPC){
                            const serv = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer())
                            DiscordWrapper.updateDetails('Prêt à jouer!')
                            DiscordWrapper.updateState('Serveur: ' + serv.getName())
                            DiscordWrapper.resetTime()
                        }
                    })
                } catch(err) {
                    loggerLaunchSuite.error('Error during launch', err)
                    showLaunchFailure('Error During Launch', 'Please check the console (CTRL + Shift + i) for more details.')
                }
            }

            // Disconnect from AssetExec
            aEx.disconnect()
        }
    })

    // Begin Validations

    // Validate Forge files.
    validateServerInformation()
}

function validateServerInformation() {
    setLaunchDetails('Chargement des informations sur le serveur..')
    DiscordWrapper.updateDetails('Chargement des informations sur le serveur..')

    DistroManager.pullRemoteIfOutdated().then(data => {
        onDistroRefresh(data)
        serv = data.getServer(ConfigManager.getSelectedServer())
        aEx.send({task: 'execute', function: 'validateEverything', argsArr: [ConfigManager.getSelectedServer(), DistroManager.isDevMode()]})
    }).catch(err => {
        loggerLaunchSuite.error('Unable to refresh distribution index.', err)
        if(DistroManager.getDistribution() == null){
            showLaunchFailure('Erreur fatale', 'Impossible de charger une copie de l\'index de distribution. Voir la console (CTRL + Shift + i) pour plus de détails.')
            // Disconnect from AssetExec
            aEx.disconnect()
        } else {
            serv = data.getServer(ConfigManager.getSelectedServer())
            aEx.send({task: 'execute', function: 'validateEverything', argsArr: [ConfigManager.getSelectedServer(), DistroManager.isDevMode()]})
        }
    })
}

/**
 * Checks the current server to ensure that they still have permission to play it (checking server code, if applicable) and open up an error overlay if specified
 * @Param {boolean} whether or not to show the error overlay
 */
function checkCurrentServer(errorOverlay = true){
    const selectedServId = ConfigManager.getSelectedServer()
    if(selectedServId){
        const selectedServ = DistroManager.getDistribution().getServer(selectedServId)
        if(selectedServ){
            if(selectedServ.getServerCode() && selectedServ.getServerCode() !== ''){
                if(!ConfigManager.getServerCodes().includes(selectedServ.getServerCode())){
                    if(errorOverlay){
                        setOverlayContent(
                            'Current Server Restricted!',
                            'It seems that you no longer have the server code required to access this server! Please switch to a different server to play on.<br><br>If you feel this is an error, please contact the server administrator',
                            'Switch Server'
                        )
                        setOverlayHandler(() => {
                            toggleServerSelection(true)
                        })
                        setDismissHandler(() => {
                            toggleOverlay(false)
                        })
                        toggleOverlay(true, true)
                    }
                    return false
                }
            }
        }
        return true
    }
}

/**
 * News Loading Functions
 */

// DOM Cache
const newsContent                   = document.getElementById('newsContent')
const newsArticleTitle              = document.getElementById('newsArticleTitle')
const newsArticleDate               = document.getElementById('newsArticleDate')
const newsArticleAuthor             = document.getElementById('newsArticleAuthor')
// const newsArticleComments           = document.getElementById('newsArticleComments')
const newsNavigationStatus          = document.getElementById('newsNavigationStatus')
const newsArticleContentScrollable  = document.getElementById('newsArticleContentScrollable')
const nELoadSpan                    = document.getElementById('nELoadSpan')

// News slide caches.
let newsActive = false
let newsGlideCount = 0

/**
 * Show the news UI via a slide animation.
 * 
 * @param {boolean} up True to slide up, otherwise false. 
 */
function slide_(up){
    const lCUpper = document.querySelector('#landingContainer > #upper')
    const lCLLeft = document.querySelector('#landingContainer > #lower > #left')
    const lCLCenter = document.querySelector('#landingContainer > #lower > #center')
    const lCLRight = document.querySelector('#landingContainer > #lower > #right')
    const newsBtn = document.querySelector('#landingContainer > #lower > #center #content')
    const landingContainer = document.getElementById('landingContainer')
    const newsContainer = document.querySelector('#landingContainer > #newsContainer')

    newsGlideCount++

    if(up){
        lCUpper.style.top = '-200vh'
        lCLLeft.style.top = '-200vh'
        lCLCenter.style.top = '-200vh'
        lCLRight.style.top = '-200vh'
        newsBtn.style.top = '130vh'
        newsContainer.style.top = '0px'
        //date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})
        //landingContainer.style.background = 'rgba(29, 29, 29, 0.55)'
        landingContainer.style.background = 'rgba(0, 0, 0, 0.50)'
        setTimeout(() => {
            if(newsGlideCount === 1){
                lCLCenter.style.transition = 'none'
                newsBtn.style.transition = 'none'
            }
            newsGlideCount--
        }, 2000)
    } else {
        setTimeout(() => {
            newsGlideCount--
        }, 2000)
        landingContainer.style.background = null
        lCLCenter.style.transition = null
        newsBtn.style.transition = null
        newsContainer.style.top = '100%'
        lCUpper.style.top = '0px'
        lCLLeft.style.top = '0px'
        lCLCenter.style.top = '0px'
        lCLRight.style.top = '0px'
        newsBtn.style.top = '10px'
    }
}

// Bind news button.
document.getElementById('newsButton').onclick = () => {
    // Toggle tabbing.
    if(document.getElementById('newsButton').hasAttribute('selected')){
        document.getElementById('newsButton').removeAttribute('selected')
    } else {
        document.getElementById('newsButton').setAttribute('selected', '')
    }
    if(newsActive){
        $('#landingContainer *').removeAttr('tabindex')
        $('#newsContainer *').attr('tabindex', '-1')
        if(hasRPC){
            if(ConfigManager.getSelectedServer()){
                const serv = DistroManager.getDistribution().getServer(ConfigManager.getSelectedServer())
                DiscordWrapper.updateDetails('Prêt à jouer!')
                DiscordWrapper.updateState('Serveur: ' + serv.getName())
            } else {
                DiscordWrapper.updateDetails('Écran d\'accueil...')
            }
        }
    } else {
        $('#landingContainer *').attr('tabindex', '-1')
        $('#newsContainer, #newsContainer *, #lower, #lower #center *').removeAttr('tabindex')
        if(newsAlertShown){
            document.getElementById('newsButtonText').removeAttribute('alertShown')
            $('#newsButtonAlert').fadeOut(1000)
            newsAlertShown = false
            ConfigManager.setNewsCacheDismissed(true)
            ConfigManager.save()
        }
        if(hasRPC){
            DiscordWrapper.updateDetails('Lis les News...')
            DiscordWrapper.clearState()
        }
    }
    slide_(!newsActive)
    newsActive = !newsActive
}

// Array to store article meta.
let newsArr = null

// News load animation listener.
let newsLoadingListener = null

/**
 * Set the news loading animation.
 * 
 * @param {boolean} val True to set loading animation, otherwise false.
 */
function setNewsLoading(val){
    if(val){
        const nLStr = 'Lis les News'
        let dotStr = '..'
        nELoadSpan.innerHTML = nLStr + dotStr
        newsLoadingListener = setInterval(() => {
            if(dotStr.length >= 3){
                dotStr = ''
            } else {
                dotStr += '.'
            }
            nELoadSpan.innerHTML = nLStr + dotStr
        }, 5)
    } else {
        if(newsLoadingListener != null){
            clearInterval(newsLoadingListener)
            newsLoadingListener = null
        }
    }
}

// Bind retry button.
newsErrorRetry.onclick = () => {
    $('#newsErrorFailed').fadeOut(150, () => {
        initNews()
        $('#newsErrorLoading').fadeIn(150)
    })
}

newsArticleContentScrollable.onscroll = (e) => {
    if(e.target.scrollTop > Number.parseFloat($('.newsArticleSpacerTop').css('height'))){
        newsContent.setAttribute('scrolled', '')
    } else {
        newsContent.removeAttribute('scrolled')
    }
}

/**
 * Reload the news without restarting.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
function reloadNews(){
    return new Promise((resolve, reject) => {
        $('#newsContent').fadeOut(150, () => {
            $('#newsErrorLoading').fadeIn(150)
            initNews().then(() => {
                resolve()
            })
        })
    })
}

let newsAlertShown = false

/**
 * Show the news alert indicating there is new news.
 */
function showNewsAlert(){
    newsAlertShown = true
    document.getElementById('newsButtonText').setAttribute('alertShown', '')
    //$(newsButtonAlert).fadeIn(150)
}

/**
 * Initialize News UI. This will load the news and prepare
 * the UI accordingly.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
function initNews(){

    return new Promise((resolve, reject) => {
        setNewsLoading(true)

        let news = {}
        loadNews().then(news => {

            newsArr = news.articles || null

            if(newsArr == null){
                // News Loading Failed
                setNewsLoading(false)

                $('#newsErrorLoading').fadeOut(150, () => {
                    $('#newsErrorFailed').fadeIn(150, () => {
                        resolve()
                    })
                })
            } else if(newsArr.length === 0) {
                // No News Articles
                setNewsLoading(false)

                ConfigManager.setNewsCache({
                    date: null,
                    content: null,
                    dismissed: false
                })
                ConfigManager.save()

                $('#newsErrorLoading').fadeOut(150, () => {
                    $('#newsErrorNone').fadeIn(150, () => {
                        resolve()
                    })
                })
            } else {
                // Success
                setNewsLoading(false)

                const lN = newsArr[0]
                const cached = ConfigManager.getNewsCache()
                let newHash = crypto.createHash('sha1').update(lN.content).digest('hex')
                let newDate = new Date(lN.date)
                let isNew = false

                if(cached.date != null && cached.content != null){

                    if(new Date(cached.date) >= newDate){

                        // Compare Content
                        if(cached.content !== newHash){
                            isNew = true
                            showNewsAlert()
                        } else {
                            if(!cached.dismissed){
                                isNew = true
                                showNewsAlert()
                            }
                        }

                    } else {
                        isNew = true
                        showNewsAlert()
                    }

                } else {
                    isNew = true
                    showNewsAlert()
                }

                if(isNew){
                    ConfigManager.setNewsCache({
                        date: newDate.getTime(),
                        content: newHash,
                        dismissed: false
                    })
                    ConfigManager.save()
                }

                const switchHandler = (forward) => {
                    let cArt = parseInt(newsContent.getAttribute('article'))
                    let nxtArt = forward ? (cArt >= newsArr.length-1 ? 0 : cArt + 1) : (cArt <= 0 ? newsArr.length-1 : cArt - 1)
            
                    displayArticle(newsArr[nxtArt], nxtArt+1)
                }

                document.getElementById('newsNavigateRight').onclick = () => { switchHandler(true) }
                document.getElementById('newsNavigateLeft').onclick = () => { switchHandler(false) }

                $('#newsErrorContainer').fadeOut(150, () => {
                    displayArticle(newsArr[0], 1)
                    $('#newsContent').fadeIn(150, () => {
                        resolve()
                    })
                })
            }

        })
        
    })
}

/**
 * Add keyboard controls to the news UI. Left and right arrows toggle
 * between articles. If you are on the landing page, the up arrow will
 * open the news UI.
 */
document.addEventListener('keydown', (e) => {
    if(newsActive){
        if(e.key === 'ArrowRight' || e.key === 'ArrowLeft'){
            document.getElementById(e.key === 'ArrowRight' ? 'newsNavigateRight' : 'newsNavigateLeft').click()
        }
        // Interferes with scrolling an article using the down arrow.
        // Not sure of a straight forward solution at this point.
        // if(e.key === 'ArrowDown'){
        //     document.getElementById('newsButton').click()
        // }
    } else {
        if(getCurrentView() === VIEWS.landing){
            if(e.key === 'ArrowUp'){
                document.getElementById('newsButton').click()
            }
        }
    }
})

/**
 * Display a news article on the UI.
 * 
 * @param {Object} articleObject The article meta object.
 * @param {number} index The article index.
 */
function displayArticle(articleObject, index){
    newsArticleTitle.innerHTML = articleObject.title
    newsArticleTitle.href = articleObject.link
    newsArticleAuthor.innerHTML = 'by ' + articleObject.author
    newsArticleDate.innerHTML = articleObject.date
    // newsArticleComments.innerHTML = articleObject.comments
    // newsArticleComments.href = articleObject.commentsLink

    let content = articleObject.content

    newsArticleContentScrollable.innerHTML = '<div id="newsArticleContentWrapper"><div class="newsArticleSpacerTop"></div>' + content + '<div class="newsArticleSpacerBot"></div></div>'
    Array.from(newsArticleContentScrollable.getElementsByClassName('bbCodeSpoilerButton')).forEach(v => {
        v.onclick = () => {
            const text = v.parentElement.getElementsByClassName('bbCodeSpoilerText')[0]
            text.style.display = text.style.display === 'block' ? 'none' : 'block'
        }
    })
    newsNavigationStatus.innerHTML = index + ' of ' + newsArr.length
    newsContent.setAttribute('article', index-1)
}

/**
 * Load news information from the RSS feed specified in the
 * distribution index.
 */
function loadNews(){
    return new Promise((resolve, reject) => {
        const distroData = DistroManager.getDistribution()
        const newsFeed = distroData.getRSS()
        const newsHost = new URL(newsFeed).origin + '/'
        $.ajax({
            url: newsFeed,
            success: (data) => {
                const items = $(data).find('item')
                const articles = []

                for(let i=0; i<items.length; i++){
                // JQuery Element
                    const el = $(items[i])

                    // Resolve date.
                    const date = new Date(el.find('pubDate').text()).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})

                    // Resolve comments.
                    // let comments = el.find('slash\\:comments').text() || '0'
                    // comments = comments + ' Comment' + (comments === '1' ? '' : 's')

                    // Fix relative links in content.
                    let content = el.find('content\\:encoded').text()
                    let regex = /src="(?!http:\/\/|https:\/\/)(.+?)"/g
                    let matches
                    while((matches = regex.exec(content))){
                        content = content.replace(`"${matches[1]}"`, `"${newsHost + matches[1]}"`)
                    }

                    let link   = el.find('link').text()
                    let title  = el.find('title').text()
                    let author = el.find('dc\\:creator').text()

                    // Generate article.
                    articles.push(
                        {
                            link,
                            title,
                            date,
                            author,
                            content,
                            // comments,
                            // commentsLink: link + '#comments'
                        }
                    )
                }
                resolve({
                    articles
                })
            },
            timeout: 2500
        }
        ).catch(err => {
            resolve({
                articles: null
            })
        })
    })
}

function parseContent(){

}