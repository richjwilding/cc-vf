import MainStore from "./MainStore"
let gapi

let google
let instance = undefined
window.GoogleHelper = GoogleHelper;
window.gapi  = gapi
export default function GoogleHelper(){
    if( instance ){
        return instance
    }
    instance = {
            scope: 'email profile https://www.googleapis.com/auth/drive',
            clientId: MainStore().env.GOOGLE_CLIENT_ID,
            developerKey: MainStore().env.GOOGLE_API_KEY,
            token: MainStore().activeUser.accessToken,

            init:async function(inital_auth){
              if(gapi){return}
              return await Promise.race([
                (async () => {
                  await new Promise((res) => setTimeout(res, 25000));
                  return false;
                })(),
                  new Promise((resolve, reject)=>{
                    const script = document.createElement('script');
            
                    script.src = "https://apis.google.com/js/api.js";
                    script.async = true;
                    script.defer = true;
                    script.onload = ()=>{
                      gapi = window.gapi
                      gapi.load('client:auth2',async  ()=>{
                        gapi.client.setToken(instance.token)
//                        gapi.client.setApiKey(instance.developerKey)

                        await gapi.client.init({
                          apiKey: instance.developerKey,
                          clientId: instance.clientId,
                          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
                          scope: instance.scope
                        })

                        console.log('gapi loaded')
                        resolve()
                      });
                    };
            
                    document.body.appendChild(script);
                })
              ])
            },
            picker:async function(){
                await this.init();
                if( !gapi.client.picker){
                    console.log(`load picker`)
                    await new Promise((resolve,reject)=>{
                        gapi.load('picker', function (args)
                        { 
                            console.log(`picker done`)
                            console.log(args)
                            resolve()
                        })
                    })
                }                
                    
            },
            drive:async function(){
                await this.init();
                if( !gapi.client.drive){
                    console.log(`load drive`)
                    await new Promise((resolve,reject)=>{
                        gapi.client.load('drive', 'v3', function (){ resolve()})
                    })
                }                
            },
            showPicker:async function(options={}){
                let _this = this 
                await this.picker();
                console.log('back')
                const google = {picker: gapi.picker.api}
                
                const callack_wrap = function(data){
                    console.log(data)
                  }



                  var view_shared = new google.picker.DocsView(google.picker.ViewId.DOCS)//.setParent('0AHX104bVkZE8Uk9PVA');
                  view_shared.setIncludeFolders(true)//.setLabel("Shared library")
                  view_shared.setEnableDrives(true)//.setLabel("Shared library")
                  
                  if( options.type == 'folder'){
                        view_shared.setSelectFolderEnabled( true )
                        .setMimeTypes('application/vnd.google-apps.folder')
                      }
          
                  var picker = new google.picker.PickerBuilder()
                      .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
                      .enableFeature(options.disable_multi_select ? false : google.picker.Feature.MULTISELECT_ENABLED)
                      .setOAuthToken(instance.token)
                      .addView(view_shared)
                      .setDeveloperKey(instance.developerKey)
                      .setOrigin(window.location.protocol + '//' + window.location.host)
                      .setCallback(callack_wrap)
          
                  var upload_view = new google.picker.DocsUploadView();
                  var venture = {folder: undefined}
                  if(venture.folder )
                  {
                    upload_view.setParent(venture.folder )
          
                    var view_folder = new google.picker.DocsView(google.picker.ViewId.DOCS).setParent(venture.folder );
                    view_folder.setIncludeFolders(true).setLabel("Project folder");
                    if( options.type == 'folder'){            
                          view_folder.setSelectFolderEnabled(options.folders )
                          .setMimeTypes('application/vnd.google-apps.folder')
                        }
                    picker.addView(view_folder);
                  }
                  picker.addView(upload_view).build().setVisible(true);


            },
            __showPicker:async function(options = {}, callback){
                let _this = this 
                await this.picker();

                const google = {picker: gapi.picker.api}

                const pickerCallback = function(data) {
                    let url = 'nothing';
                    if (data[google.picker.Response.ACTION] == google.picker.Action.PICKED) {
                      let doc = data[google.picker.Response.DOCUMENTS][0];
                      url = doc[google.picker.Document.URL];
                    }
                    let message = `You picked: ${url}`;
                    console.log(message)
                  }

                const showPicker = () => {
                    console.log(_this.token)
                    console.log(_this.developerKey)
                    const picker = new google.picker.PickerBuilder()
                        .addView(google.picker.ViewId.DOCS)
                        .setOAuthToken(_this.token)
                        .setDeveloperKey(_this.developerKey)
                        .setCallback(pickerCallback)
                        .build();
                    picker.setVisible(true);
                  }
                  showPicker()
                  return
            },
            getFileInfo:async function(id){
              const _this = this
                let out
                let retries = 1
                const request = async ()=>{

                  try{

                    await this.drive()
                    await gapi.client.drive.files
                    .get({
                      fileId:id,
                      fields: 'id, name, mimeType, modifiedTime',
                      supportsAllDrives: true,
                      supportsSharedDrives:true,
                    })
                    .then(async function (response) {
                      out = await _this.checkAndRetry( response, request, retries--)
                    });
                  }catch( response ){
                     console.log(response)
                      out = await _this.checkAndRetry( response, request, retries--)
                  }
                }
                await request()
                return out
            },
            checkAndRetry:async function( response, request, retries ){
                if( response.status !== 200 ){
                  console.log(`Response = ${response.status} - retries remaining = ${retries}`)
                  if( retries > 0 ){
                    const old = instance.token
                    await MainStore().refreshUser()
                    instance.token = MainStore().activeUser.accessToken
                    gapi.client.setToken(instance.token)
                    console.log(old === instance.token ? " - SAME" : " + NEW")
                    await request()
                  }
                }else{
                  return JSON.parse(response.body);
                }
            }
    }
    return instance
}