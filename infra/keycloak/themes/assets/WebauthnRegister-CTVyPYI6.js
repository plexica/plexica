import{u as k,r as O,a as y,g as N,j as t}from"./index-BwQgcLE_.js";import{w as S}from"./waitForElementMountedOnDom-qpCjLZnq.js";y();y();function B(a){const{authButtonId:e,kcContext:n,i18n:i}=a,{url:l,challenge:r,userid:s,username:o,signatureAlgorithms:d,rpEntityName:m,rpId:c,attestationConveyancePreference:g,authenticatorAttachment:u,requireResidentKey:b,userVerificationRequirement:x,createTimeout:f,excludeCredentialIds:j}=n,{msgStr:p,isFetchingTranslations:h}=i,{insertScriptTags:C}=k({componentOrHookName:"LoginRecoveryAuthnCodeConfig",scriptTags:[{type:"module",textContent:()=>`
                    import { registerByWebAuthn } from "${l.resourcesPath}/js/webauthnRegister.js";
                    const registerButton = document.getElementById('${e}');
                    registerButton.addEventListener("click", function() {
                        const input = {
                            challenge : '${r}',
                            userid : '${s}',
                            username : '${o}',
                            signatureAlgorithms : ${JSON.stringify(d)},
                            rpEntityName : ${JSON.stringify(m)},
                            rpId : ${JSON.stringify(c)},
                            attestationConveyancePreference : ${JSON.stringify(g)},
                            authenticatorAttachment : ${JSON.stringify(u)},
                            requireResidentKey : ${JSON.stringify(b)},
                            userVerificationRequirement : ${JSON.stringify(x)},
                            createTimeout : ${f},
                            excludeCredentialIds : ${JSON.stringify(j)},
                            initLabel : ${JSON.stringify(p("webauthn-registration-init-label"))},
                            initLabelPrompt : ${JSON.stringify(p("webauthn-registration-init-label-prompt"))},
                            errmsg : ${JSON.stringify(p("webauthn-unsupported-browser-text"))}
                        };
                        registerByWebAuthn(input);
                    });
                `}]});O.useEffect(()=>{h||(async()=>(await S({elementId:e}),C()))()},[h])}function J(a){const{kcContext:e,i18n:n,doUseDefaultCss:i,Template:l,classes:r}=a,{kcClsx:s}=N({doUseDefaultCss:i,classes:r}),{url:o,isSetRetry:d,isAppInitiatedAction:m}=e,{msg:c,msgStr:g}=n,u="authenticateWebAuthnButton";return B({authButtonId:u,kcContext:e,i18n:n}),t.jsxs(l,Object.assign({kcContext:e,i18n:n,doUseDefaultCss:i,classes:r,headerNode:t.jsxs(t.Fragment,{children:[t.jsx("span",{className:s("kcWebAuthnKeyIcon")}),c("webauthn-registration-title")]})},{children:[t.jsx("form",Object.assign({id:"register",className:s("kcFormClass"),action:o.loginAction,method:"post"},{children:t.jsxs("div",Object.assign({className:s("kcFormGroupClass")},{children:[t.jsx("input",{type:"hidden",id:"clientDataJSON",name:"clientDataJSON"}),t.jsx("input",{type:"hidden",id:"attestationObject",name:"attestationObject"}),t.jsx("input",{type:"hidden",id:"publicKeyCredentialId",name:"publicKeyCredentialId"}),t.jsx("input",{type:"hidden",id:"authenticatorLabel",name:"authenticatorLabel"}),t.jsx("input",{type:"hidden",id:"transports",name:"transports"}),t.jsx("input",{type:"hidden",id:"error",name:"error"}),t.jsx($,{kcClsx:s,i18n:n})]}))})),t.jsx("input",{type:"submit",className:s("kcButtonClass","kcButtonPrimaryClass","kcButtonBlockClass","kcButtonLargeClass"),id:u,value:g("doRegisterSecurityKey")}),!d&&m&&t.jsx("form",Object.assign({action:o.loginAction,className:s("kcFormClass"),id:"kc-webauthn-settings-form",method:"post"},{children:t.jsx("button",Object.assign({type:"submit",className:s("kcButtonClass","kcButtonDefaultClass","kcButtonBlockClass","kcButtonLargeClass"),id:"cancelWebAuthnAIA",name:"cancel-aia",value:"true"},{children:c("doCancel")}))}))]}))}function $(a){const{kcClsx:e,i18n:n}=a,{msg:i}=n;return t.jsx("div",Object.assign({id:"kc-form-options",className:e("kcFormOptionsClass")},{children:t.jsx("div",Object.assign({className:e("kcFormOptionsWrapperClass")},{children:t.jsx("div",Object.assign({className:"checkbox"},{children:t.jsxs("label",{children:[t.jsx("input",{type:"checkbox",id:"logout-sessions",name:"logout-sessions",value:"on",defaultChecked:!0}),i("logoutOtherSessions")]})}))}))}))}export{J as default};
