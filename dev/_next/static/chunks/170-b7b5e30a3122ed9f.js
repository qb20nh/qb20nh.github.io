"use strict";(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[170],{80513:function(e,t,n){n.d(t,{m:function(){return c}});var o=n(85893),r=n(65988),i=n.n(r),a=(n(67294),n(11163)),l=n(10195),c=function(e){var t=(0,a.useRouter)();return(0,o.jsxs)(o.Fragment,{children:[(0,o.jsx)("div",{onClick:"notfound"===e.type?function(){return t.push("/")}:void 0,className:"jsx-ffddb87d302206e5 "+(("notfound"===e.type?(0,l.cn)("error-wrapper","error-not-found"):"error-wrapper")||""),children:"notpublic"===e.type?(0,o.jsxs)("div",{className:"jsx-ffddb87d302206e5",children:[(0,o.jsx)("p",{className:"jsx-ffddb87d302206e5 error-text",children:"Hmm. Looks like your Notion page doesn\u2019t"}),(0,o.jsx)("p",{className:"jsx-ffddb87d302206e5 error-text",children:"exist yet, or sharing is disabled."})]}):(0,o.jsxs)("div",{className:"jsx-ffddb87d302206e5",children:[(0,o.jsx)("p",{className:"jsx-ffddb87d302206e5 error-text",children:"This page doesn't seem to exist."}),(0,o.jsx)("p",{className:"jsx-ffddb87d302206e5 error-text",children:"Click anywhere to go back."})]})}),(0,o.jsx)(i(),{id:"ffddb87d302206e5",children:"body{background-color:#eff4fe!important}\n.error-wrapper{min-height:100vh;\nheight:100%;\nwidth:100%;\ndisplay:-webkit-box;\ndisplay:-webkit-flex;\ndisplay:-ms-flexbox;\ndisplay:flex;\n-webkit-flex-direction:column;\n-ms-flex-direction:column;\nflex-direction:column;\n-webkit-justify-content:center;\njustify-content:center;\n-webkit-align-items:center;\n-webkit-box-align:center;\n-ms-flex-align:center;\nalign-items:center;\ntext-align:center}\n.error-not-found{cursor:pointer}\n.error-image{width:400px;\nheight:327px;\nposition:relative}\n.error-text{font-size:26px;\nfont-weight:600;\nline-height:1.8;\ncolor:#000}\n@media (max-width:680px) {.error-image{width:500px;\nheight:409px}\n.error-text{font-size:24px}}\n@media (max-width:546px) {.error-image{width:400px;\nheight:327px}\n.error-text{font-size:18px}}"})]})}},21098:function(e,t,n){n.d(t,{p:function(){return b}});var o=n(85893),r=n(67294),i=n(9008);function a(e,t,n){return t in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}var l={templateTitle:"",noindex:!1,nofollow:!1,defaultOpenGraphImageWidth:0,defaultOpenGraphImageHeight:0,defaultOpenGraphVideoWidth:0,defaultOpenGraphVideoHeight:0},c=function(e){var t=[];e.titleTemplate&&(l.templateTitle=e.titleTemplate);var n="";e.title&&(n=e.title,l.templateTitle&&(n=l.templateTitle.replace(/%s/g,(function(){return n}))),t.push((0,o.jsx)("title",{children:n},"title")));var r=e.noindex||l.noindex||e.dangerouslySetAllPagesToNoIndex,i=e.nofollow||l.nofollow||e.dangerouslySetAllPagesToNoFollow;if(r||i?(e.dangerouslySetAllPagesToNoIndex&&(l.noindex=!0),e.dangerouslySetAllPagesToNoFollow&&(l.nofollow=!0),t.push((0,o.jsx)("meta",{name:"robots",content:"".concat(r?"noindex":"index",",").concat(i?"nofollow":"follow")},"robots")),t.push((0,o.jsx)("meta",{name:"googlebot",content:"".concat(r?"noindex":"index",",").concat(i?"nofollow":"follow")},"googlebot"))):(t.push((0,o.jsx)("meta",{name:"robots",content:"index,follow"},"robots")),t.push((0,o.jsx)("meta",{name:"googlebot",content:"index,follow"},"googlebot"))),e.description&&t.push((0,o.jsx)("meta",{name:"description",content:e.description},"description")),e.twitter&&(e.twitter.cardType&&t.push((0,o.jsx)("meta",{name:"twitter:card",content:e.twitter.cardType},"twitter:card")),e.twitter.site&&t.push((0,o.jsx)("meta",{name:"twitter:site",content:e.twitter.site},"twitter:site")),e.twitter.handle&&t.push((0,o.jsx)("meta",{name:"twitter:creator",content:e.twitter.handle},"twitter:creator"))),e.openGraph){if((e.openGraph.url||e.canonical)&&t.push((0,o.jsx)("meta",{property:"og:url",content:e.openGraph.url||e.canonical},"og:url")),e.openGraph.type){var c=e.openGraph.type.toLowerCase();t.push((0,o.jsx)("meta",{property:"og:type",content:c},"og:type"))}(e.openGraph.title||e.title)&&t.push((0,o.jsx)("meta",{property:"og:title",content:e.openGraph.title||n},"og:title")),(e.openGraph.description||e.description)&&t.push((0,o.jsx)("meta",{property:"og:description",content:e.openGraph.description||e.description},"og:description")),e.defaultOpenGraphImageWidth&&(l.defaultOpenGraphImageWidth=e.defaultOpenGraphImageWidth),e.defaultOpenGraphImageHeight&&(l.defaultOpenGraphImageHeight=e.defaultOpenGraphImageHeight),e.openGraph.images&&e.openGraph.images.length&&e.openGraph.images.forEach((function(e,n){t.push((0,o.jsx)("meta",{property:"og:image",content:e.url},"og:image:0".concat(n))),e.alt&&t.push((0,o.jsx)("meta",{property:"og:image:alt",content:e.alt},"og:image:alt0".concat(n))),e.width?t.push((0,o.jsx)("meta",{property:"og:image:width",content:e.width.toString()},"og:image:width0".concat(n))):l.defaultOpenGraphImageWidth&&t.push((0,o.jsx)("meta",{property:"og:image:width",content:l.defaultOpenGraphImageWidth.toString()},"og:image:width0".concat(n))),e.height?t.push((0,o.jsx)("meta",{property:"og:image:height",content:e.height.toString()},"og:image:height".concat(n))):l.defaultOpenGraphImageHeight&&t.push((0,o.jsx)("meta",{property:"og:image:height",content:l.defaultOpenGraphImageHeight.toString()},"og:image:height".concat(n)))})),e.openGraph.locale&&t.push((0,o.jsx)("meta",{property:"og:locale",content:e.openGraph.locale},"og:locale")),e.openGraph.site_name&&t.push((0,o.jsx)("meta",{property:"og:site_name",content:e.openGraph.site_name},"og:site_name"))}return e.canonical&&t.push((0,o.jsx)("link",{rel:"canonical",href:e.canonical},"canonical")),e.additionalMetaTags&&e.additionalMetaTags.length>0&&e.additionalMetaTags.forEach((function(e){t.push((0,o.jsx)("meta",function(e){for(var t=1;t<arguments.length;t++){var n=null!=arguments[t]?arguments[t]:{},o=Object.keys(n);"function"===typeof Object.getOwnPropertySymbols&&(o=o.concat(Object.getOwnPropertySymbols(n).filter((function(e){return Object.getOwnPropertyDescriptor(n,e).enumerable})))),o.forEach((function(t){a(e,t,n[t])}))}return e}({},e),e.name?e.name:e.property))})),t};function p(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}function u(e,t){for(var n=0;n<t.length;n++){var o=t[n];o.enumerable=o.enumerable||!1,o.configurable=!0,"value"in o&&(o.writable=!0),Object.defineProperty(e,o.key,o)}}function s(e){return(s=Object.setPrototypeOf?Object.getPrototypeOf:function(e){return e.__proto__||Object.getPrototypeOf(e)})(e)}function d(e,t){return!t||"object"!==h(t)&&"function"!==typeof t?function(e){if(void 0===e)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return e}(e):t}function f(e,t){return(f=Object.setPrototypeOf||function(e,t){return e.__proto__=t,e})(e,t)}var h=function(e){return e&&"undefined"!==typeof Symbol&&e.constructor===Symbol?"symbol":typeof e};function g(e){var t=function(){if("undefined"===typeof Reflect||!Reflect.construct)return!1;if(Reflect.construct.sham)return!1;if("function"===typeof Proxy)return!0;try{return Boolean.prototype.valueOf.call(Reflect.construct(Boolean,[],(function(){}))),!0}catch(e){return!1}}();return function(){var n,o=s(e);if(t){var r=s(this).constructor;n=Reflect.construct(o,arguments,r)}else n=o.apply(this,arguments);return d(this,n)}}var m=function(e){!function(e,t){if("function"!==typeof t&&null!==t)throw new TypeError("Super expression must either be null or a function");e.prototype=Object.create(t&&t.prototype,{constructor:{value:e,writable:!0,configurable:!0}}),t&&f(e,t)}(l,e);var t,n,r,a=g(l);function l(){return p(this,l),a.apply(this,arguments)}return t=l,(n=[{key:"render",value:function(){var e=this.props,t=e.title,n=e.noindex,r=void 0!==n&&n,a=e.nofollow,l=e.description,p=e.canonical,u=e.openGraph,s=e.facebook,d=e.twitter,f=e.additionalMetaTags,h=e.titleTemplate,g=e.mobileAlternate,m=e.languageAlternates;return(0,o.jsx)(i.default,{children:c({title:t,noindex:r,nofollow:a,description:l,canonical:p,facebook:s,openGraph:u,additionalMetaTags:f,twitter:d,titleTemplate:h,mobileAlternate:g,languageAlternates:m})})}}])&&u(t.prototype,n),r&&u(t,r),l}(r.Component),x=n(27397);function y(e,t,n){return t in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}var b=function(e){var t,n,r,i,a=(null===e||void 0===e?void 0:e.head)||{},l=a.title,c=a.description,p=a.url,u=a.image,s=(null===e||void 0===e||null===(t=e.settings)||void 0===t?void 0:t.name)||"",d=u||(null===e||void 0===e||null===(n=e.page)||void 0===n?void 0:n.cover)||"",f=l||(0,x.S$)(null===e||void 0===e||null===(r=e.page)||void 0===r?void 0:r.title)||"",h={title:f,description:c,openGraph:{type:"website",locale:"en_US",url:p,site_name:l||s,description:c,images:[{url:d,alt:f}]},twitter:{cardType:"summary_large_image"}};return(null===e||void 0===e||null===(i=e.settings)||void 0===i?void 0:i.noIndex)&&(h.noindex=!0,h.nofollow=!0),(0,o.jsx)(m,function(e){for(var t=1;t<arguments.length;t++){var n=null!=arguments[t]?arguments[t]:{},o=Object.keys(n);"function"===typeof Object.getOwnPropertySymbols&&(o=o.concat(Object.getOwnPropertySymbols(n).filter((function(e){return Object.getOwnPropertyDescriptor(n,e).enumerable})))),o.forEach((function(t){y(e,t,n[t])}))}return e}({},h))}},10195:function(e,t,n){n.d(t,{cn:function(){return o}});var o=function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];return t.filter((function(e){return!!e})).join(" ")}},27397:function(e,t,n){n.d(t,{Fk:function(){return r},wj:function(){return i},HU:function(){return a},q6:function(){return l},S$:function(){return c}});var o,r=function(e){return/^data:image/.test(e)},i=function(e){return"block-"+e},a=function(e,t){return null===e||void 0===e?void 0:e.startsWith(t.assetEndpoint)},l=function(e){return null===e||void 0===e?void 0:e.startsWith("https://images.unsplash.com")},c=function(e){return null!==(o=null===e||void 0===e?void 0:e.reduce((function(e,t){return e+t[0]}),""))&&void 0!==o?o:""}}}]);