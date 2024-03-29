import path from "path";
import ejs from 'ejs';
import { decodePath, fetchPrimitive, getDataForProcessing, primitiveListOrigin, primitiveOrigin } from "./SharedFunctions"
import fs from 'fs';

const sections = [
    {        
        class: 'hero-section',
        fragment: `
            <section class="hero-section">
            <div class="container">
                <div class="row align-items-center">
                <div class="col-md-6">
                    <h1>{hero_title}</h1>
                    <h3 class='highlight'>{hero_text}</h3>
                </div>
                <div class="col-md-6">
                    <img src="{hero_image}" alt="Hero Image" class="img-fluid" style="box-shadow: 2px 2px 10px 6px #b5b5b55c;">
                </div>
                </div>
            </div>
            </section>
        `,
        replace:{
            "hero_title": "referenceParameters.hero_text",
            "hero_text": "referenceParameters.hero_overview",
            "hero_image": {type: "image_url" }
        }
        
    },{
        class: "how-it-works",
        fragment:`<section class="how-it-works">
            <div class="container">
                <div class="row align-items-center">
                <div class="col-md-6">
                    <img src="{image_hiw}" alt="How It Works Image" class="img-fluid">
                </div>
                <div class="col-md-6">
                    <h2>How It Works</h2>
                    <ol>
                    {steps}
                    </ol>
                </div>
                </div>
            </div>
            </section>`,
            replace:{
                steps: {type: "list", asHtml: "li", field: "referenceParameters.how_it_works"},
                "image_hiw": {type: "image_url", tag: "hiw"}

            }
    },{
        class: "case-studies",
        fragment:`<section class="case-studies">
                    <div class="container">
                        <div id="caseStudiesCarousel" class="carousel slide" data-ride="carousel">
                        <div class="carousel-inner">
                            {inner}
                        </div>
                        <a class="carousel-control-prev" href="#caseStudiesCarousel" role="button" data-slide="prev">
                            <span class="carousel-control-prev-icon" aria-hidden="true"></span>
                            <span class="sr-only">Previous</span>
                        </a>
                        <a class="carousel-control-next" href="#caseStudiesCarousel" role="button" data-slide="next">
                            <span class="carousel-control-next-icon" aria-hidden="true"></span>
                            <span class="sr-only">Next</span>
                        </a>
                        </div>
                    </div>
                    </section>`,
        subfragments: {
            "inner": {
                "fragment":{first :
                            `<div class="carousel-item active">
                            <div class="container">
                              <div class="row">
                                <div class="col-6">
                                    <img src="{image}" class="image-crop img-fluid" alt="Responsive image">
                                </div>
                                <div class="col-6">
                                  <h3 class='highlight'>Your challenge: {title}</h3>
                                  <p>{text}</p>
                                </div>
                              </div>
                            </div>
                          </div>`,
                            other:`<div class="carousel-item">
                            <div class="container">
                              <div class="row">
                                <div class="col-6">
                                    <img src="{image}" class="image-crop img-fluid" alt="Responsive image">
                                </div>
                                <div class="col-6">
                                  <h3 class='highlight'>Your challenge: {title}</h3>
                                  <p>{text}</p>
                                </div>
                              </div>
                            </div>
                          </div>`
                },
                replace:{
                    "title": "referenceParameters.use_cases.{n}.problem",
                    "text": "referenceParameters.use_cases.{n}.solution",
                    "image": {type: "image_url", tag: "uc_{n}"}
                }
            }
        },
        replace:{
            inner: {type: "nested", field: "referenceParameters.use_cases"}
        }
    },{
        class: "call-to-action"
    }
]
const pageHeader = `<!DOCTYPE html>
<html lang="en">
<head>
<link href="https://fonts.googleapis.com/css?family=Roboto:400,700&display=swap" rel="stylesheet">
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Simple Landing Page</title>
<!-- Include Bootstrap CSS -->
<link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">
<style>
    ${sections.map(d=>`.${d.class}`).join(", ")} {
    padding: 90px 0;
  }
  
  .image-crop {
    width: 480px;
    height: 320px;
    object-fit: cover;
  }

  body {
    background-color: #0f0f0f;
    font-family: 'Roboto', sans-serif;
  }

  #caseStudiesCarousel{
    border: 1px solid #7a7a7a;
    border-left: 0;
    border-right: 0;
    padding: 15px 5px;
  }
  .hero-section {
    background-image: linear-gradient(to top, #39ff14, #0f0f0f 25%);
    color: #e8e8e8; /* Assuming your text color is light */
    padding: 60px; /* Or any other padding value you prefer */
    /* Other styles for your hero section */
  }
  
  /* Style for paragraph text */
  p {
    color: #cccccc;
    font-size: 18px;
    line-height: 1.6;
  }
  
  /* Styles for headings */
  h1 {
    color: #e8e8e8;
    font-size: 48px;
    font-weight: 700;
    margin-bottom: 20px;
  }
  
  h2 {
    color: #e8e8e8;
    font-size: 36px;
    font-weight: 600;
    margin-bottom: 15px;
  }
  h3 {
    color: #e8e8e8;
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 15px;
  }
  
  /* Highlight color for important text or buttons */
  .highlight {
    color: #39ff14;
  }
  ul {
    list-style-type: none;
    padding-left: 0;
    margin-left: 1em;
  }
  
  li {
    color: #cccccc;
    font-size: 18px;
    line-height: 1.8;
    padding: 5px 0;
  }
  
  ul li::before {
    content: '•';
    color: #39ff14;
    display: inline-block;
    width: 1em;
    margin-left: -1em;
  }
  
  li a {
    color: #39ff14;
    text-decoration: none;
  }
  
  li a:hover, li a:focus {
    text-decoration: underline;
  }

</style>
</head>
<body>`

const pageFooter = `<!-- Include Bootstrap JS and its dependencies -->
<script src="https://code.jquery.com/jquery-3.5.1.slim.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/popper.js@1.9.5/dist/umd/popper.min.js"></script>
<script src="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/js/bootstrap.min.js"></script>

</body>
</html>
`

export async function buildPage(primitive){
    const templatePath = path.join(__dirname, 'templates', 'landing_page.ejs');
    const template = fs.readFileSync(templatePath, 'utf-8');
    const concept = (await primitiveListOrigin( [primitive], "hierarchy", undefined, "ALL", 92))?.[0]
    const valueProp = (await primitiveListOrigin( [primitive], "hierarchy", undefined, "ALL", 91))?.[0]
    const [pricing,_] = valueProp ? await getDataForProcessing(valueProp, {referenceId: 101, target: "children", action_override: true}) : [undefined, undefined]

    let pricing_grid = pricing.map((d,i)=>{return {
        title: d.title,
        price: d.referenceParameters?.price_month,
        description: d.referenceParameters?.description,
        features:d.referenceParameters?.features,
        highlight: i === 1
    }})

    try{
        let result = ejs.render(template, {data:{
            color_scheme:"emerald",
            title: await concept?.title,
            page_title: primitive.title,
            hero_title: primitive.referenceParameters?.hero_text,
            hero_text: primitive.referenceParameters?.hero_overview,
            logo_list: [`/published/image/${concept?.id}_logo`],
            icon_image: `/published/image/${concept?.id}`,
            hero_image: `/published/image/${primitive.id}`,
            screenshot: `/published/image/${primitive.id}_hiw`,
            use_cases: primitive.referenceParameters?.use_cases ?? [],
            benefits: primitive.referenceParameters?.benefits ?? [],
            how_it_works: primitive.referenceParameters?.how_it_works ?? [],
            pricing: pricing_grid.slice(0),
            currency: undefined
            }
        })
        return result
    }catch(error){
        console.log(error)
    }
}
export async function _buildPage(primitive){
    let domain = "http://localhost:3000/"
    let path = domain + "api/image/"
    let rendered = [pageHeader]


    function replaceItems(d, idx = 0){
        if(!d.replace){
            return ["", false]
        }
        let out = d.fragment instanceof Object ? (idx === 0 ? d.fragment.first : d.fragment.other) : d.fragment
        let done = false
        for(const k of Object.keys(d.replace)){
            const field = d.replace[k]
            let value
            if( typeof(field) === "object" ){
                if( field.type === "image_url"){
                    let tag = field.tag ? `_${field.tag}` : ""
                    tag = tag.replaceAll("{n}", idx)
                    value = path + primitive.id + tag
                }else if( field.type === "list"){
                    value = decodePath(primitive, field.field)
                    let fragment = ""
                    for(const d of Array.isArray(value) ? value : value.split("\n")){
                        const item = (field.asHtml ? `<${field.asHtml}>` : "") + d + (field.asHtml ? `</${field.asHtml}>` : "")
                        fragment += item + "\n"
                    }
                    value = fragment
                }else if( field.type === "nested"){
                    value = decodePath(primitive, field.field.replaceAll("{n}", idx))
                    let fragment = ""
                    let nestedFragment = d.subfragments[k]
                    let idx = 0
                    for(const d of Array.isArray(value) ? value : value.split("\n")){
                        const [item, present] = replaceItems( nestedFragment, idx )
                        if( true || present ){
                            fragment += item + "\n"
                            idx++
                        }
                    }
                    value = fragment
                }
            }
            else{
                value = decodePath(primitive, field.replaceAll("{n}", idx))
            }
            if( value ){
                out = out.replaceAll(`{${k}}`, value)
                done = true
            }
        }
        return [out, done]

    }

    for(const d of sections){
        console.log(d.class)
        if( d.fragment ){
            let [out, done] = replaceItems(d)
            if( done ){
                rendered.push( out)
            }
        }
    }
    rendered.push(pageFooter)
    return rendered.join("\n")
} 