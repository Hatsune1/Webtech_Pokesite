// Run a node.js web server for local development of a static web site. Create a
// site folder, put server.js in it, create a sub-folder called "public", with
// at least a file "index.html" in it. Start the server with "node server.js &",
// and visit the site at the address printed on the console.
//     The server is designed so that a site will still work if you move it to a
// different platform, by treating the file system as case-sensitive even when
// it isn't (as on Windows and some Macs). URLs are then case-sensitive.
//     All HTML files are assumed to have a .html extension and are delivered as
// application/xhtml+xml for instant feedback on XHTML errors. Content
// negotiation is not implemented, so old browsers are not supported. Https is
// not supported. Add to the list of file types in defineTypes, as necessary.

// Change the port to the default 80, if there are no permission issues and port
// 80 isn't already in use. The root folder corresponds to the "/" url.
let port = 8080;
let root = "./public"

// Load the library modules, and define the global constants and variables.
// Load the promises version of fs, so that async/await can be used.
// See http://en.wikipedia.org/wiki/List_of_HTTP_status_codes.
// The file types supported are set up in the defineTypes function.
// The paths variable is a cache of url paths in the site, to check case.
let http = require("http");
let fs = require("fs").promises;
let sqlite3 = require("sqlite3").verbose();
let createdb = require("./createdb");
let OK = 200, NotFound = 404, BadType = 415, Error = 500;
let types, paths, requestkws;
let db = undefined;
var setdb = false;

// Start the server:
start();

// Check the site, giving quick feedback if it hasn't been set up properly.
// Start the http service. Accept only requests from localhost, for security.
// If successful, the handle function is called for each request.
async function start() {
    try {
        await fs.access(root);
        await fs.access(root + "/index.html");
        db = new sqlite3.Database("./data.db");
        if(setdb) db.serialize(createdb.create);
        types = defineTypes();
        paths = new Set();
        listPaths(paths);
        requestkws = new Set();
        listRequestkws(requestkws);
        let service = http.createServer(handle);
        service.listen(port, "localhost");
        let address = "http://localhost";
        if (port != 80) address = address + ":" + port;
        console.log("Server running at", address);
    }
    catch (err) { console.log(err); process.exit(1); }
}

function listPaths(paths) {
    paths.add("/");
    paths.add("/chatroom.html");
    paths.add("/mainpage.html");
    paths.add("/pokemon.html");
    paths.add("/pokesearch.html");
}

function listRequestkws(rkws) {
    rkws.add("/startersData");
    rkws.add("/pokemonsData");
    rkws.add("/favoonData");
    rkws.add("/favooffData");
}

// Serve a request by delivering a file.
async function handle(request, response) {
    let url = request.url;
    if (url.endsWith("/")) url = url + "index.html";
    let isPageRequest = await checkPath(url);
    // Original part, deliver file content in response.
    if (isPageRequest) {
        let type = findType(url);
        if (type == null) return fail(response, BadType, "File type not supported");
        let file = root + url;
        let content = await fs.readFile(file);
        deliver(response, type, content);
    }
    // Pass rkws to rkwsHandler, else else fail.
    else if (paths.has(url.split("?")[0])) getHandler(url, response);
    else if (requestkws.has(url)) rkwsHandler(url, response);
    else return fail(response, NotFound, "URL not found (check case)");
}




function getHandler(url, response){
    if (url.split("?")[0] == "/pokemon.html") pokemonInfo(url, response);
    else if (url.split("?")[0] == "/pokedex.html") getPokemonList(url, response);
    else return fail(response, NotFound, "URL not found (check params)");
}

async function pokemonInfo(url, response){
    var params = url.split("?")[1];
    var paramslist = params.split("&");
    // Pokemon page data insert to template.
    if (paramslist.length == 1){
        var key = parseInt(params.split("=")[0]);
        var val = parseInt(params.split("=")[1]);
        var content = await fs.readFile(root+url.split("?")[0], "utf8");
        db.get("SELECT * FROM POKEDEX WHERE ID = ?", val, function(err, row){
            if (err) {
                fail(response, NotFound, "URL not found (check params)");
            }
            else {
                if (row == undefined) fail(response, NotFound, "URL not found (check params)");
                else {
                    content = content.replace(/PokemonName/g, row.NAME);
                    content = content.replace(/PokemonNumber/g, addzero(row.ID));
                    content = content.replace(/Number/g, row.ID);
                    content = content.replace(/type1/g, row.TYPE1);
                    if (row.TYPE2 != null) content = content.replace(/type2/g, row.TYPE2);
                    else content = content.replace(/type2/g, "");
                    if (row.PS) {
                        content = content.replace(/id="off"/g, 'id="on"');
                        content = content.replace(/polystaroff/g, "polystaron");
                    }
                    deliver(response,types["html"], content);
                }
            }
        });
    }
    // Change favorate settings for pokemon.
    if (paramslist.length == 2){
        var ps = paramslist[0].split("=")[1]; 
        var id = paramslist[1].split("=")[1];
        console.log(ps,id);
        db.run("UPDATE POKEDEX SET PS="+ps+" WHERE ID="+id);
    }
}

async function getPokemonList(url, response){
    var params = url.split("?")[1];
    var key = params.split("=")[0];
    var val = params.split("=")[1];
    if (key == "TYPE") {
        if (val == "ALL") return allData(response, deliver, "POKEDEX");
        key = "TYPE1=? OR TYPE2";
        val = [val,val];
    }
    if (key == "ID") val = parseInt(val);
    db.all("SELECT * FROM POKEDEX WHERE "+key+"=? ORDER BY ID", val, function(err, rows){
        if (err) {
            throw err;
        }
        else {
            deliver(response,"text/plain", JSON.stringify(rows));
        }
    });
}

function addzero(id){
    id = id.toString();
    if (id.length == 1) id = "00" + id;
    if (id.length == 2) id = "0"  + id;
    return id;
}

// RkwsHandler and functions get data from database to response.
async function rkwsHandler(rkws, response) {
    if (rkws == "/startersData") allData(response,deliver,"POKEDEX_STARTERS");
    if (rkws == "/pokemonsData") allData(response,deliver,"POKEDEX");
    if (rkws == "/favoonData") favoData(response,deliver);
    if (rkws == "/favooffData") allData(response,deliver,"POKEDEX");
}

async function allData(response,deliver,tableName) {
    db.all("SELECT * FROM "+tableName+" ORDER BY ID", [], function(err,rows){
        if (err) {
            throw err;
        }
        else {
            deliver(response,"text/plain", JSON.stringify(rows));
        }
    });
}

async function favoData(response,deliver) {
    db.all("SELECT * FROM POKEDEX WHERE PS=1 ORDER BY ID", [], function(err,rows){
        if (err) {
            throw err;
        }
        else {
            deliver(response,"text/plain", JSON.stringify(rows));
        }
    });
}


// Check if a path is in or can be added to the set of site paths, in order
// to ensure case-sensitivity.
async function checkPath(path) {
    if (! paths.has(path)) {
        let n = path.lastIndexOf("/", path.length - 2);
        let parent = path.substring(0, n + 1);
        let ok = await checkPath(parent);
        if (ok) await addContents(parent);
    }
    return paths.has(path);
}

// Add the files and subfolders in a folder to the set of site paths.
async function addContents(folder) {
    let folderBit = 1 << 14;
    let names = await fs.readdir(root + folder);
    for (let name of names) {
        let path = folder + name;
        let stat = await fs.stat(root + path);
        if ((stat.mode & folderBit) != 0) path = path + "/";
        paths.add(path);
    }
}

// Find the content type to respond with, or undefined.
function findType(url) {
    let dot = url.lastIndexOf(".");
    let extension = url.substring(dot + 1);
    return types[extension];
}

// Deliver the file that has been read in to the browser.
function deliver(response, type, content) {
    let typeHeader = { "Content-Type": type };
    response.writeHead(OK, typeHeader);
    response.write(content);
    response.end();
}

// Give a minimal failure response to the browser
function fail(response, code, text) {
    let textTypeHeader = { "Content-Type": "text/plain" };
    response.writeHead(code, textTypeHeader);
    response.write(text, "utf8");
    response.end();
}

// The most common standard file extensions are supported, and html is
// delivered as "application/xhtml+xml".  Some common non-standard file
// extensions are explicitly excluded.  This table is defined using a function
// rather than just a global variable, because otherwise the table would have
// to appear before calling start().  NOTE: add entries as needed or, for a more
// complete list, install the mime module and adapt the list it provides.
function defineTypes() {
    let types = {
        html : "application/xhtml+xml",
        css  : "text/css",
        js   : "application/javascript",
        mjs  : "application/javascript", // for ES6 modules
        png  : "image/png",
        gif  : "image/gif",    // for images copied unchanged
        jpeg : "image/jpeg",   // for images copied unchanged
        jpg  : "image/jpeg",   // for images copied unchanged
        svg  : "image/svg+xml",
        json : "application/json",
        pdf  : "application/pdf",
        txt  : "text/plain",
        ttf  : "application/x-font-ttf",
        woff : "application/font-woff",
        aac  : "audio/aac",
        mp3  : "audio/mpeg",
        mp4  : "video/mp4",
        webm : "video/webm",
        ico  : "image/x-icon", // just for favicon.ico
        xhtml: undefined,      // non-standard, use .html
        htm  : undefined,      // non-standard, use .html
        rar  : undefined,      // non-standard, platform dependent, use .zip
        doc  : undefined,      // non-standard, platform dependent, use .pdf
        docx : undefined,      // non-standard, platform dependent, use .pdf
    }
    return types;
}