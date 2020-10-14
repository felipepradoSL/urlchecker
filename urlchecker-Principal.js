/****************************************************************************
**  Autor: Yuri Carvalho (yuri.castro.neo@gmail.com)
**
**  Descrição: verifica URLs e Tracking Templates de anúncios de acordo
**  com :
**  1) https://support.google.com/google-ads/answer/6328603?co=ADWORDS.IsAWNCustomer%3Dtrue&hl=pt-BR&oco=1
**  2) https://support.google.com/adspolicy/answer/6368661#672
**
**
**  v2.0 
**    - Atualizado por Sweet Leads Empreendimentos Digitais
**      https://sweetleads.com.br
**      felipe@sweetleads.com.br
**
**    - GitHub:
**      https://github.com/felipepradoSL/urlchecker
**
**  Updates:
**    - Se o erro for 404 ou 403, as URLs serão armazenadas numa planilha (campanha não pausada),
**      ela será comparada na próxima vez que o script for executado.
**      Se a próxima execução do script (após 1 hora) a campanha ainda apresentar o erro,
**      então são pausadas as campanhas e enviado o email de alerta.
**
**  Pode ser que o Google, ao tentar acessar alguma URL, encontre algum problema interno mesmo
**  que ela esteja funcionando normalmente. Para evitar que o script insista no erro, basta
**  adicionar as URLs na planilha: 
**  
**- White list:
**  https://docs.google.com/spreadsheets/d/1CooE7_jDfLrrY48N9pkME8LDTlxmP17saaxhf1-f5KU/
**
**- Error list:
**  https://docs.google.com/spreadsheets/d/1h8OICAigvvy_iz9m0CN3MSGx21ECSglX0F3C2_Vw5ko/
**
**  
**  Precisa apagar a url da Planilha de Erros depois que for ajustado
**    -> Inserir script que apaga a planilha e executa-lo a cada 24h
**
*****************************************************************************/


//array com condições dos anuncios
ADS_CONDITIONS =
["CampaignStatus = ENABLED"
,"AdGroupStatus = ENABLED"
,"Status = ENABLED"
];

//e-mail destinatário
NOTIF_EMAIL = "felipe@sweetleads.com.br"

//assunto email
EMAIL_SUBJECT = "Algumas URLs de anúncio apresentaram problemas!"

//ID da planilha do google
WHITELIST_SS_ID = "1CooE7_jDfLrrY48N9pkME8LDTlxmP17saaxhf1-f5KU"


ERRORSLIST_SS_ID = "1h8OICAigvvy_iz9m0CN3MSGx21ECSglX0F3C2_Vw5ko"

//Função principal
function main() {
  //obtem a white list da planilha
  var whiteList = getWhiteList(WHITELIST_SS_ID)

  //obtem os anuncios
  var results = getAds(ADS_CONDITIONS,whiteList)//retorna todas as campanhas e url +url template da whitelist num array => Ads
    .map(checkUrls)//verificas as urls
    .filter(hasErrors)//filtra pelos erros retornados do array quais têm erro
    .map(saveSpreadSheets)
    //.map(pauseCampaign);//pausa a campanha

    Logger.log("*************results****************");
    Logger.log(JSON.stringify(results))
    Logger.log("*************results****************");

  var shouldNotify = notNil(results) ? true : false; //verifica se retornou anuncios com erros
  
  if(shouldNotify){//envia email caso houver anuncios com erros
    var emailBody = composeEmail(results)
    MailApp.sendEmail(NOTIF_EMAIL, EMAIL_SUBJECT, emailBody, { noReply: true });
  }
}

//retornar a whitelist da planilha de acordo com o ID passado
function getWhiteList(ssId){
  return SpreadsheetApp
  .openById(ssId)
  .getDataRange()
  .getValues()
  .reduce(function(acc,row){ return acc.concat(row)})
  .filter(function(x){ return x.length > 0 })
}

function getErrorsReports(ssId){
  return SpreadsheetApp
  .openById(ssId)
  .getDataRange()
  .getValues()
  .reduce(function(acc,row){ return acc.concat(row)})
  .filter(function(x){ return x.length > 0 })
}


//verifica se o indice da lista existe
function notIn(list, el){
  return list.indexOf(el) < 0;
}

//pega os anuncios com erros
function getAds(conds,whitelist) {

  var ads = [];//array que armazenará os anuncios com erros
  
  var rawAdsIt = AdsApp.ads(); //novo objeto raiz da API google Ads
  
  var adsIt = conds
  .reduce(function(acc,cond){ return acc.withCondition(cond) }, rawAdsIt)
    .get(); //retorna todos os anuncios com as condições passadas como parametro


  while(adsIt.hasNext()) { //enquando existir anuncio ativo

    var current = adsIt.next();//anuncio atual
    var campaign = current.getCampaign();//obtem a campanha
    var urls = current.urls();//obtem url atual
    var finalUrl = urls.getFinalUrl();//url após ter redirecionado
    var trackingTemplate = urls.getTrackingTemplate();//Retorna o modelo de acompanhamento do anúncio.
    
    var adData = { campaign: campaign }//objeto com a campanha

    
    if(notIn(whitelist, finalUrl)){//verifica se a url final não está na whitelist
      adData['finalUrl'] = finalUrl  //atribui a url no objeto 
    }


    if(notIn(whitelist, trackingTemplate)){//verifica se a modelo de acompanhamento está na whitelist
      adData['trackingTemplate'] = trackingTemplate    //atribui a url no objeto
    }


    if(adData.finalUrl || adData.trackingTemplate){ //caso algum atributo do objeto existir
      ads.push(adData)//atribui o objeto no array
    }
    
    
  }
  
  return ads //retorna a url e o modelo de acampanhamento do anuncio com erro

}

//função que verfica os erros 403 e 404
function isClientError(respCode){
  return respCode === 403 || respCode === 404;
}

//função que verifica a existencia de variavel
function notNil(xs){
  return xs.length && xs.length !== 0;
}

//
function checkUrls(obj) {

  obj['errors'] = []
  obj['code'] = []
  
  // otherwise the script will crash when given bad urls
  var defaultParams = { 
    muteHttpExceptions: true,
    validateHttpsCertificates: false,
    contentType: 'text/html; charset=utf-8',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36' }
  };

  //

  
  if(obj.finalUrl){//veririca se existe url final

    try{
      var finalUrlResponse = UrlFetchApp.fetch(obj.finalUrl, defaultParams);
      var finalUrlResponseCode = finalUrlResponse.getResponseCode();//testa a url final e retorna o código de resposta

      if(isClientError(finalUrlResponseCode)){//verifica se o código de respostá é o 403 ou 404
        //obj.errors.push("URL final não encontrada, erro " + finalUrlResponseCode);//caso true, insere o erro no array
        obj.errors.push(finalUrlResponseCode);
      }
    }catch(e){//excessão de nao retornar nada
      obj.errors.push("A URL final não pôde ser acessada (pode estar temporariamente indisponível/Servidor fora do ar). Código de respsota: " + finalUrlResponseCode) 
      obj.code.push(finalUrlResponseCode)
    }
    

  }
  
  if(obj.trackingTemplate){//verifica se existe modelo de acompanhamento

    try{
      var trackingTemplateResponse = UrlFetchApp.fetch(obj.trackingTemplate, defaultParams);
      var trackingTemplateResponseCode = trackingTemplateResponse.getResponseCode();//testa o modelo de acompanhamento e retorna o código de resposta

      if(isClientError(trackingTemplateResponseCode)){//verifica se o código de respostá é o 403 ou 404
       //obj.errors.push("URL do modelo de acompanhamento não encontrado, erro " + trackingTemplateResponseCode);//caso true, insere o erro no array
       obj.errors.push(trackingTemplateResponseCode);
     }
    }catch(e){//excessão de nao retornar nada
      obj.errors.push("O modelo de acompanhamento não pôde ser acessado (pode estar temporariamente indisponível/Servidor fora do ar). Código de respsota: " + trackingTemplateResponseCode)
      obj.code.push(trackingTemplateResponseCode)
    }    
    
  }  

  return obj;  
}

//funcão que pausa a campanha e aguarda 2000 milisegundos(delay)
function pauseCampaign(obj){
  obj.campaign.pause();
  Utilities.sleep(2000);
  
  return obj;
}

//função que verifica se existe algum erro no objeto (no atributo 'erros') 
function hasErrors(obj){
  return notNil(obj.errors);
}

 //função que monta o corpo do email 
 function composeEmail(results){
  var currentAccount = AdsApp.currentAccount();
  var accountName = currentAccount.getName();
  var accountId = currentAccount.getCustomerId();

  var firstLine = "Conta: "+ accountName + " - " + accountId + " \n" + "\n" + "As seguintes campanhas tiveram anúncio REPROVADO e foram pausadas: "+ "\n";
  
  var body = results.reduce(function(acc,obj){
    var campaignName = obj.campaign.getName();
    var errors = obj.errors.reduce(function(res,err){ return res + "\n" + err}, "")
    
    return "********************\n" + "Campanha: " + campaignName + "\n" + "\n" + "Motivos: URL Final ou URL do modelo de acompanhamento não encontrada " + errors + "\n" 
    
  }, firstLine);  
  
  var footer = "\n\nCaso alguma URL esteja funcionando normalmente, basta adicioná-la em https://docs.google.com/spreadsheets/d/" + WHITELIST_SS_ID + "/ para incluir na whitelist."

  return body + "" + footer;
}


//Salva a planilha
function saveSpreadSheets(obj){

    var ss = SpreadsheetApp.openById(ERRORSLIST_SS_ID);//open google sheets by ID (URL)
    var sheet = ss.getActiveSheet(); // select sheet actived

    // var issues = [];

    // var finalUrl = obj.finalUrl;
    // var trackingTemplate = obj.trackingTemplate;

    // issues.push([
    //     finalUrl,
    //     trackingTemplate
    //   ]);

    var errorsList = getErrorsReports(ERRORSLIST_SS_ID);

    if (!notNil(obj.code)) {  
      if ((notIn(errorsList,obj.finalUrl))||(notIn(errorsList,obj.trackingTemplate))) {
        sheet.appendRow([obj.finalUrl,obj.trackingTemplate]);
        obj.pop();
      }
    }
    return obj
  }