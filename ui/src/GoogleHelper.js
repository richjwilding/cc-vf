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
                      const script2 = document.createElement('script');
                        
                      script2.src = "https://accounts.google.com/gsi/client";
                      script2.async = true;
                      script2.defer = true;
                      script2.onload = async ()=>{
                        gapi.load('client', async ()=>{
                          gapi.client.setToken(instance.token)
                          resolve()
                        })
                      };
                      document.body.appendChild(script2);
                    };
            
                    document.body.appendChild(script);
                })
              ])
            },
            picker:async function(){
                await this.init();
                if( !gapi.client.picker){
                    await new Promise((resolve,reject)=>{
                        gapi.load('picker', function (args)
                        { 
                            console.log(args)
                            resolve()
                        })
                    })
                }                
                    
            },
            drive:async function(){
                await this.init();
                if( !gapi.client.drive){
                    await new Promise((resolve,reject)=>{
                        gapi.client.load('drive', 'v3', function (){ resolve()})
                    })
                }                
            },
            showPicker:async function(options={}, callback){
                let _this = this 
                await this.picker();
                const google = {picker: gapi.picker.api}
                
                const callack_wrap = function(data){
                  if( data.action === 'cancel'){
                    callback(undefined)
                  }
                  if( data.action === 'picked'){
                    callback(data.docs.map((item)=>{return {id: item.id, name: item.name, mimeType: item.mimeType }}))
                  }
                }



                  var view_shared = new google.picker.DocsView(google.picker.ViewId.DOCS)
                  view_shared.setIncludeFolders(true)
                  view_shared.setEnableDrives(true)//.setLabel("Shared library")
                  
                  if( options.type == 'folder'){
                        view_shared.setSelectFolderEnabled( true )
                        .setMimeTypes('application/vnd.google-apps.folder')
                      }
          
                  var picker = new google.picker.PickerBuilder()
                      .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
                      .enableFeature(options.disable_multi_select ? false : google.picker.Feature.MULTISELECT_ENABLED)
                      .setOAuthToken(instance.token)
                      .setDeveloperKey(instance.developerKey)
                      .setOrigin(window.location.protocol + '//' + window.location.host)
                      .setCallback(callack_wrap)

                      
                  var upload_view = new google.picker.DocsUploadView();

                  var venture = {folder: '1fWKPCc68RLFt9pe3a8sBUZt8Ue_q4GMA'}
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
                  
                  picker.addView(view_shared)
                  picker.addView(upload_view)
                  picker.build().setVisible(true);


            },
            getFileComments:async function(id){
              const _this = this
                let out
                let retries = 2
                const request = async ()=>{
                  try{
                    await this.drive()
                    await gapi.client.request({
                      'path': '/drive/v3/files/' + id + '/comments',
                      'method': 'GET',
                      'headers': {
                        'Content-Type': 'media',           
                        'Authorization': 'Bearer ' + instance.token
                      },
                      'params': {
                        pageSize: 100,
                        fields: '*',
                        key: instance.developerKey
                      }
                    }).then(async function (response) {
                      out = await _this.checkAndRetry( response, request, retries--)
                    });
                  }catch( response ){
                      out = await _this.checkAndRetry( response, request, retries--)
                  }
                }
                await request()
                return out
            },
            getDocument:async function(file, format = 'application/pdf'){
              if( file.type === "google_drive"){
                if( file.mimeType === "application/pdf" ){
                  if( format === "text/plain")
                  {
                    return await this.downloadGoogleFileAsText( file.id,  (file.name || "unknown").replace(/pdf$/, 'gdoc') )
                  }
                  return await this.downloadGoogleFile( file.id )
                }else{
                  return await this.exportGoogleDoc( file.id, format)
                }
              }
            },
            downloadGoogleFileAsText:async function(id, title ){
              const _this = this
              const request = async (retries = 2)=>{
                  let out
                  try{
                    await this.drive()
                    await gapi.client.request({
                      'path': '/drive/v3/files/' + id + '/copy',
                      'method': 'POST',
                      'headers': {
                        'Content-Type': 'application/json',           
                        'Authorization': 'Bearer ' + instance.token
                      },
                      'params': {
                        supportsAllDrives: true,
                      },
                      body: {
                        "name": title,
                        "mimeType": "application/vnd.google-apps.document"
                      },
                    }).then(async function (response) {
                      out = await _this.checkAndRetry( response, request, retries--)
                    });
                  }catch( response ){
                      out = await _this.checkAndRetry( response, request, retries--)
                  }
                  if( out && out.kind === "drive#file"){
                    const final = await this.exportGoogleDoc( out.id, "text/plain")
                    console.log(`GOT FINAL`)
                    
                    try{
                      await this.drive()
                      await gapi.client.request({
                        'path': '/drive/v3/files/' + out.id,
                        'method': 'DELETE',
                        'headers': {
                          'Content-Type': 'application/json',           
                          'Authorization': 'Bearer ' + instance.token
                        },
                        'params': {
                          supportsAllDrives: true,
                        },
                      })
                    }catch( error ){
                      console.warn(error)
                    }


                    return final
                  }
                  return out
                }
                
                return await request()                
            },
            downloadGoogleFile:async function(id){
              const _this = this
              const request = async (retries = 2)=>{
                  let out
                  try{
                    await this.drive()
                    await gapi.client.request({
                      'path': '/drive/v3/files/' + id,
                      'method': 'GET',
                      'headers': {
                        'Content-Type': 'application/json',           
                        'Authorization': 'Bearer ' + instance.token
                      },
                      'params': {
                        supportsAllDrives: true,
                        alt: 'media'
                      }
                    }).then(async function (response) {
                      out = await _this.checkAndRetry( response, request, retries--)
                    });
                  }catch( response ){
                      out = await _this.checkAndRetry( response, request, retries--)
                  }
                  return out
                }
                
                return await request()                
            },
            exportGoogleDoc:async function(id, format = 'application/pdf'){
              const _this = this
                let retries = 2

                const request = async ()=>{
                  try{
                    await this.drive()
                    return await gapi.client.request({
                      'path': '/drive/v3/files/' + id + '/export',
                      'method': 'GET',
                      'headers': {
                        'Content-Type': 'blob',           
                        'Authorization': 'Bearer ' + instance.token
                      },
                      'params': {
                        supportsAllDrives: true,
                        mimeType: format,
                        key: instance.developerKey
                      }
                    }).then(async function (response) {
                      console.log(`check 1`)
                    const o = await _this.checkAndRetry( response, request, retries--)
                    console.log(o.length)
                      return o
                    });
                  }catch( response ){
                    console.log(`check 2`)
                    console.log(response.length)
                    return  await _this.checkAndRetry( response, request, retries--)
                  }
                }
                console.log(`FIRST CALL FOR PDF`)
                return await request()
            },
            getFileInfo:async function(id){
              const _this = this
              const request = async (retries = 2)=>{
                  let out
                  try{
                    await this.drive()
                    await gapi.client.request({
                      'path': '/drive/v3/files/' + id,
                      'method': 'GET',
                      'headers': {
                        'Content-Type': 'application/json',           
                        'Authorization': 'Bearer ' + instance.token
                      },
                      'params': {
                        supportsAllDrives: true,
                        fields: 'id, name, mimeType, modifiedTime',
                        key: instance.developerKey
                      }
                    }).then(async function (response) {
                      out = await _this.checkAndRetry( response, request, retries--)
                    });
                  }catch( response ){
                      out = await _this.checkAndRetry( response, request, retries--)
                  }
                  return out
                }
                
                return await request()                
            },
            checkAndRetry:async function( response, request, retries ){
              console.log(`checking ${retries}`)
                if( response.status === 401 ){
                  console.log(`Response = ${response.status} - retries remaining = ${retries}`)
                  if( retries > 0 ){
                    const old = instance.token
                    await MainStore().refreshUser()
                    instance.token = MainStore().activeUser.accessToken
                    gapi.client.setToken(instance.token)
                    console.log(old === instance.token ? " - SAME" : " + NEW")
                    console.log(`requesting....`)
                    const retry = await request(retries)
                    return retry
                  }
                }
                if( response.status === 200 ){
                  console.log(`success @ ${retries}`)
                  if( retries < 2){
                    console.log(response)
                  }
                  try{
                    return JSON.parse(response.body);
                  }catch{
                    console.log(response.body.slice(0,10))
                    return response.body
                  }
                }else{
                  console.warn( `STATUS: ${response.status}`) 
                  console.warn( response ) 
                  throw new Error(response.body)
                }
            }
    }
    return instance
}