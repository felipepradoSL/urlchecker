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
**      então são removidas da planilha e as campanhas são pausadas e enviado o email de alerta.
**      Caso não haja erro 404 ou 403 e ocorra algum outro erro, a campanha é pausada e o email de alerta é enviado
**      exibindo qual o código do erro ou qual erro ocorreu.
**      Caso após 1hora a campanha não esteja apresentando erro novamente, ela será limpa da planilha de erros.
**
**  Pode ser que o Google, ao tentar acessar alguma URL, encontre algum problema interno mesmo
**  que ela esteja funcionando normalmente. Para evitar que o script insista no erro, basta
**  adicionar as URLs na planilha: 
**  
**- White list:
**  https://docs.google.com/spreadsheets/d/1XpdWUYN5bcMj-WP2yExQkyYs_Kd88E12ycDilWL0CBo/
**
**- Error list:
**  https://docs.google.com/spreadsheets/d/1jajBR8QBYRh0CoOEzpXmB3W2FPHHdTghs3U0-BYl-HA/
**
**  v2.0
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
WHITELIST_SS_ID = "1XpdWUYN5bcMj-WP2yExQkyYs_Kd88E12ycDilWL0CBo"


ERRORSLIST_SS_ID = "1jajBR8QBYRh0CoOEzpXmB3W2FPHHdTghs3U0-BYl-HA"

//Função principal
function main() {
  //obtem a white list da planilha
  var whiteList = getWhiteList(WHITELIST_SS_ID)

  //obtem os anuncios
  var results = getAds(ADS_CONDITIONS,whiteList)//retorna todas as campanhas e url +url template da whitelist num array => Ads
    .map(checkUrls)//verificas as urls
    .filter(hasErrors);//filtra pelos erros retornados do array quais têm erro

  var checking = results.filter(hasCode)    //função que filtra as campanhas que estão apresentando erros e serão enviadas por email                                             
    .map(pauseCampaign);                    //caso campanha apresentou erro novamente, será removida da planilha e pausada  
                                            //pausa a campanha

  prepareSpreadSheet(); // Limpa a planilha para inserir os novos erros
                        // Os erros anteriores que ainda estão na planilha serão apagados, pois não apresentaram erro novamente após 1 hora
    
  var verify = results.filter(verifySheet) //campanhas que retornaram 404 403 e serão gravadas na planilha
    .map(saveSpreadSheets);  

    Logger.log("*************gravadas****************");
    Logger.log(JSON.stringify(verify))
    Logger.log("*************gravadas****************");

    Logger.log("*************pausadas****************");
    Logger.log(JSON.stringify(checking))
    Logger.log("*************pausadas****************");

  var shouldNotify = notNil(checking) ? true : false; //verifica se retornou anuncios com erros
  
  if(shouldNotify){//envia email caso houver anuncios com erros
    var emailBody = composeEmail(checking)
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

//retornar a errorlist da planilha de acordo com o ID passado
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

//testa as urls UrlFetchAPP
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

  if(obj.finalUrl){//veririca se existe url final
    
    try{
      var finalUrlResponse = UrlFetchApp.fetch(obj.finalUrl, defaultParams);
      var finalUrlResponseCode = finalUrlResponse.getResponseCode();//testa a url final e retorna o código de resposta
  
      if(isClientError(finalUrlResponseCode)){//verifica se o código de respostá é o 403 ou 404
        obj.errors.push("URL final não encontrada, erro " + finalUrlResponseCode);//caso true, insere o erro no array       
      }
    }catch(e){//excessão de nao retornar nada
      obj.errors.push("A URL final não pôde ser acessada (pode estar temporariamente indisponível/Servidor fora do ar). Código de respsota: " + finalUrlResponseCode) 
      obj.code.push("Erro: " + e);
    }    
      
  }
  
  if(obj.trackingTemplate){//verifica se existe modelo de acompanhamento
    
    try{
      var trackingTemplateResponse = UrlFetchApp.fetch(obj.trackingTemplate, defaultParams);
      var trackingTemplateResponseCode = trackingTemplateResponse.getResponseCode();//testa o modelo de acompanhamento e retorna o código de resposta
  
      if(isClientError(trackingTemplateResponseCode)){//verifica se o código de respostá é o 403 ou 404
       obj.errors.push("URL do modelo de acompanhamento não encontrado, erro " + trackingTemplateResponseCode);//caso true, insere o erro no array       
      }
    }catch(e){//excessão de nao retornar nada
      obj.errors.push("O modelo de acompanhamento não pôde ser acessado (pode estar temporariamente indisponível/Servidor fora do ar). Código de respsota: " + trackingTemplateResponseCode)
      obj.code.push("Erro: " + e);
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

//retorna as campanhas que serao gravadas na planilha
function verifySheet(obj){
    var errorsList = getErrorsReports(ERRORSLIST_SS_ID);

    if ((obj.code)&&(notIn(errorsList,obj.finalUrl))){
        return false;
      }
      else if (inSheet(errorsList, obj.finalUrl)){
        return false;
       }
      else
      {      
        return true;
      }

}

 //verifica se o indice da lista existe
 function inSheet(list, el){
    return list.indexOf(el) > -1;
 }

  //função que filtra as campanhas que estão apresentando erros e serão enviadas por email
  //caso campanha apresentou erro novamente, será removida da planilha e pausada
  function hasCode(obj){
    Logger.log("filtrando...")

    var errorsList = getErrorsReports(ERRORSLIST_SS_ID);

    if ((obj.code)&&(notIn(errorsList,obj.finalUrl))){
      return true;
    }
    else if (inSheet(errorsList, obj.finalUrl)){
      Logger.log(obj.finalUrl);
      deleteRowSpreadSheet(errorsList.indexOf(obj.finalUrl));
      return true;
     }
    else
    {
      return false;
    }
  }

  function deleteRowSpreadSheet(el){
    var ss = SpreadsheetApp.openById(ERRORSLIST_SS_ID);
    var sheet = ss.getActiveSheet();
    
    sheet.deleteRow(el + 1);
    Logger.log("deletado");
  }

 //função que monta o corpo do email 
 function composeEmail(results){
  var currentAccount = AdsApp.currentAccount();
  var accountName = currentAccount.getName();
  var accountId = currentAccount.getCustomerId();

  var firstLine = "Conta: " + accountName + " - " + accountId + " \n " + " \n " + " As URLs das seguintes campanhas não estão respondendo e foram pausadas: " + " \n ";
  
  var body = results.reduce(function(acc,obj){
    var campaignName = obj.campaign.getName();
    var errors = obj.errors.reduce(function(res,err){ return res + "\n" + err}, "")
    
    return acc +="********************\n" + "Campanha: " + campaignName + "\n" + "\n" + "Motivos: URL Final ou URL do modelo de acompanhamento não encontrada " + errors + "\n";
    
  }, firstLine);  
  
  var footer = "\n\nCaso alguma URL esteja funcionando normalmente, basta adicioná-la em https://docs.google.com/spreadsheets/d/" + WHITELIST_SS_ID + "/ para incluir na whitelist.";

  return body + "" + footer;
}

//Salva a planilha
function saveSpreadSheets(obj){
    Logger.log("Gravando na planilha...")

    var ss = SpreadsheetApp.openById(ERRORSLIST_SS_ID);//open google sheets by ID (URL)
    var sheet = ss.getActiveSheet(); // select sheet actived

    Logger.log(obj.finalUrl);
    Logger.log(" ###########");
    Logger.log(obj.campaign.getName());

    sheet.appendRow([ obj.finalUrl, obj.campaign.getName() ]);

    return obj
  }

//Limpa e prepara a planilha
function prepareSpreadSheet(){
  var ss = SpreadsheetApp.openById(ERRORSLIST_SS_ID);
  var sheet = ss.getActiveSheet();

  sheet.clear();
}