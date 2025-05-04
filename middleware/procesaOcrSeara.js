var sequelize = require("../models/sequelizeConnection");
var imp_sku = require("../models/imp_sku");
var imp_importacion_archivo = require("../models/imp_importacion_archivo");
var imp_importacion = require("../models/imp_importacion");
var { valCantidad, valCodigo, valFecha, valValor } = require("./validaciones");

const procesaOcrSeara = async (ocr, ocrPL, nroDespacho) => {
  let dataImportacion = await imp_importacion.findOne({
    where: { nroDespacho: nroDespacho },
  });
  if (dataImportacion.tipoTranporte.toUpperCase() == "TERRESTRE") {
    return procesaOcrSearaTerrestre(ocr, ocrPL, nroDespacho);
  }
  if (dataImportacion.tipoTranporte.toUpperCase() == "MARITIMO") {
    return procesaOcrSearaMaritimo(ocr, ocrPL, nroDespacho);
  }
  if (dataImportacion.tipoTranporte.toUpperCase() == "AEREO") {
    return procesaOcrSearaAereo(ocr, ocrPL, nroDespacho);
  }
};

const procesaOcrSearaTerrestre = async (ocr, ocrPL, nroDespacho) => {
  let data = [];

  //Procesa FACTURA COMERCIAL

  let paginasFactura = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (
      texto.includes("FACTURA COMERCIAL") &&
      !texto.includes("CARTA DE PORTE INTERNACIONAL") &&
      !texto.includes("MANIFESTO INTERNACIONAL")
    ) {
      paginasFactura.push(i);
    }
  }

  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    let tablaPL = ocrPL.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      if (texto.includes("CAJAS PALETIZADAS")) {
        let item = {
          cantidad: "0",
          codigo: "",
          descripcion: "",
          valor: "0",
          peso: "0",
          codigoInvalido: false,
          cantidadInvalida: false,
          valorInvalido: false,
        };

        let linea = tabla[i - 1].split("\t");

        item.cantidad = linea[0]
          .replace(/[^\d,\.]/g, "")
          .replace(/\./g, "")
          .replace(/,/g, ".");
        item.valor = linea[linea.length - 2]
          .replace(/[^\d,\.]/g, "")
          .replace(/\./g, "")
          .replace(/,/g, ".");

        let linea2 = tabla[i].split("\t");

        let lineaConCodigo = linea2.join(" ").replace(/\r/g, "").split(" ");

        item.codigo = lineaConCodigo[lineaConCodigo.length - 2];

        item.codigoInvalido = await valCodigo(item.codigo);
        item.cantidadInvalida = await valCantidad(item.cantidad);
        item.valorInvalido = await valValor(item.valor);

        data.push(item);
      }
    }
  }

  if (data.length == 0) {
    await procesaOcrSearaEstrategia2(ocr, ocrPL, nroDespacho);
  } else {
    try {
      await imp_importacion_archivo.update(
        { detalles: JSON.stringify(data) },
        { where: { nroDespacho: nroDespacho } }
      );
    } catch (error) {
      console.log(error);
    }
  }

  //  Procesa PACKING LIST
  //Se busca la pagina que contiene el packing list
  //Se busca la tabla que contiene los datos del packing list

  let paginasPackingList = [];
  let dataPacking = [];

  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("PACKING LIST")) {
      paginasPackingList.push(i);
    }
  }

  for (let [j, pagina] of paginasPackingList.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      let textoLineaSiguiente = "";
      if (i < tabla.length - 1) {
        textoLineaSiguiente = tabla[i + 1].toUpperCase();
      }

      if (
        texto.includes("DESCRIPCIÓN") ||
        (texto.includes("SIF") && texto.includes("PESO BRUTO"))
      ) {
        let indInicio = i + 1;
        for (let k = indInicio; k < indInicio + 100; k++) {
          if (k >= tabla.length) {
            break;
          }
          let linea = tabla[k].split("\t");
          let item = {
            descripcion: "",
            fechaProduccion: "",
            sif: "",
            fechaVencimiento: "",
            CajasPallet: "",
            PesoNeto: "",
            PesoBruto: "",
            vencimientoInvalido: false,
            pesonetoInvalido: false,
            pesobrutoInvalido: false,
          };
          // if (linea.length < 7) {
          //   const nuevoArr = [...linea]; // copiar para no modificar el original
          //   nuevoArr.splice(1, 0, "01/01/2000");
          //   linea = nuevoArr;
          // }

          if (linea.length > 6) {
            item.descripcion = linea[0];
            item.fechaProduccion = linea[linea.length - 7];
            item.sif = linea[linea.length - 6];

            let f = linea[linea.length - 5].replace("'", "/");
            if (f.length == 10) {
              let ano = f.slice(0, 4);
              let mes = f.slice(5, 7);
              let dia = f.slice(8, 10);
              item.fechaVencimiento = `${ano}/${mes}/${dia}`;
            } else {
              item.fechaVencimiento = linea[linea.length - 5].replace("'", "/");
            }

            item.CajasPallet = linea[linea.length - 4];
            item.PesoNeto = linea[linea.length - 3]
              .replace("o", "0")
              .replace(/[^\d,\.]/g, "")
              .replace(/,/g, "");
            item.PesoBruto = linea[linea.length - 2]
              .replace("o", "0")
              .replace(/[^\d,\.]/g, "")
              .replace(/,/g, "");

            item.vencimientoInvalido = await valFecha(item.fechaVencimiento);
            item.pesonetoInvalido = await valCantidad(item.PesoNeto);
            item.pesobrutoInvalido = await valCantidad(item.PesoBruto);

            dataPacking.push(item);
          }
        }

        try {
          await imp_importacion_archivo.update(
            { packingList: JSON.stringify(dataPacking) },
            { where: { nroDespacho: nroDespacho } }
          );
        } catch (error) {
          console.log(error);
        }
      }
    }
  }

  if (dataPacking.length == 0) {
    for (let [j, pagina] of paginasPackingList.entries()) {
      let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");

      for (let [i, e] of tabla.entries()) {
        let texto = e.toUpperCase();
        let textoLineaSiguiente = "";
        if (i < tabla.length - 1) {
          textoLineaSiguiente = tabla[i + 1].toUpperCase();
        }

        if (texto.includes("DESCRIPCIÓN")) {
          let indInicio = i + 1;
          for (let k = indInicio; k < indInicio + 100; k++) {
            if (k >= tabla.length) {
              break;
            }
            let linea = tabla[k].split("\t");
            let item = {
              descripcion: "",
              fechaProduccion: "",
              sif: "",
              fechaVencimiento: "",
              CajasPallet: "",
              PesoNeto: "",
              PesoBruto: "",
              vencimientoInvalido: false,
              pesonetoInvalido: false,
              pesobrutoInvalido: false,
            };

            if (linea.length > 5) {
              item.descripcion = linea[0];
              item.fechaProduccion = linea[1];
              item.sif = linea[2];

              let f = linea[3].replace("'", "/");
              if (f.length == 10) {
                let ano = f.slice(0, 4);
                let mes = f.slice(5, 7);
                let dia = f.slice(8, 10);
                item.fechaVencimiento = `${ano}/${mes}/${dia}`;
              } else {
                item.fechaVencimiento = linea[3].replace("'", "/");
              }

              item.CajasPallet = linea[4];
              item.PesoNeto = linea[5]
                .replace("o", "0")
                .replace(/[^\d,\.]/g, "")
                .replace(/,/g, "");
              item.PesoBruto = linea[6]
                .replace("o", "0")
                .replace(/[^\d,\.]/g, "")
                .replace(/,/g, "");

              item.vencimientoInvalido = await valFecha(item.fechaVencimiento);
              item.pesonetoInvalido = await valCantidad(item.PesoNeto);
              item.pesobrutoInvalido = await valCantidad(item.PesoBruto);

              dataPacking.push(item);
            }
          }

          try {
            await imp_importacion_archivo.update(
              { packingList: JSON.stringify(dataPacking) },
              { where: { nroDespacho: nroDespacho } }
            );
          } catch (error) {
            console.log(error);
          }
        }
      }
    }
  }
};

const procesaOcrSearaEstrategia3 = async (ocr, ocrPL, nroDespacho) => {
  var data = [];

  //Procesa FACTURA COMERCIAL
  //Se busca la pagina que contiene la factura comercial
  //Se busca la tabla que contiene los datos de la factura comercial
  //Se busca la linea que contiene la cantidad y el valor
  //Se busca la linea que contiene el codigo
  //Se guarda la cantidad, el valor y el codigo en el objeto item
  //Se guarda el array data en la base de datos

  let paginasFactura = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("FACTURA COMERCIAL")) {
      paginasFactura.push(i);
    }
  }

  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");
    let tablaPL = ocrPL.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      let textoLineaSiguiente = "";
      if (i < tabla.length - 1) {
        textoLineaSiguiente = tabla[i + 1].toUpperCase();
      }
      if (texto.includes("VALOR FCA") && textoLineaSiguiente.includes("NCM")) {
        let item = {
          cantidad: "0",
          codigo: "",
          descripcion: "",
          valor: "0",
          peso: "0",
          codigoInvalido: false,
          cantidadInvalida: false,
          valorInvalido: false,
        };

        let linea = tabla[i - 2].split("\t");

        item.cantidad = linea[0].replace(/\./g, "").replace(/,/g, ".");
        item.valor = linea[linea.length - 2]
          .replace(/\./g, "")
          .replace(/,/g, ".");

        let linea2 = tabla[i - 1].split("\t");

        let lineaConCodigo = linea2.join(" ").replace(/\r/g, "").split(" ");

        item.codigo = lineaConCodigo[lineaConCodigo.length - 2];

        item.codigoInvalido = await valCodigo(item.codigo);
        item.cantidadInvalida = await valCantidad(item.cantidad);
        item.valorInvalido = await valValor(item.valor);

        data.push(item);
      }
    }
  }

  if (data.length == 0) {
    console.log("No se encontraron datos en la factura comercial");
  } else {
    try {
      await imp_importacion_archivo.update(
        { detalles: JSON.stringify(data) },
        { where: { nroDespacho: nroDespacho } }
      );
    } catch (error) {
      console.log(error);
    }
  }
};

const procesaOcrSearaEstrategia2 = async (ocr, ocrPL, nroDespacho) => {
  var data = [];

  //Procesa FACTURA COMERCIAL
  //Se busca la pagina que contiene la factura comercial
  //Se busca la tabla que contiene los datos de la factura comercial
  //Se busca la linea que contiene la cantidad y el valor
  //Se busca la linea que contiene el codigo
  //Se guarda la cantidad, el valor y el codigo en el objeto item
  //Se guarda el array data en la base de datos

  let paginasFactura = [];
  for (let [i, e] of ocrPL.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("FACTURA COMERCIAL")) {
      paginasFactura.push(i);
    }
  }

  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocrPL.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      let textoLineaSiguiente = "";
      if (i < tabla.length - 1) {
        textoLineaSiguiente = tabla[i + 1].toUpperCase();
      }
      if (texto.includes("VALOR FCA") && textoLineaSiguiente.includes("NCM")) {
        let item = {
          cantidad: "0",
          codigo: "",
          descripcion: "",
          valor: "0",
          peso: "0",
          codigoInvalido: false,
          cantidadInvalida: false,
          valorInvalido: false,
        };

        let linea = tabla[i - 2].split("\t");

        item.cantidad = linea[0].replace(/\./g, "").replace(/,/g, ".");
        item.valor = linea[linea.length - 2]
          .replace(/\./g, "")
          .replace(/,/g, ".");

        let linea2 = tabla[i - 1].split("\t");

        let lineaConCodigo = linea2.join(" ").replace(/\r/g, "").split(" ");

        item.codigo = lineaConCodigo[lineaConCodigo.length - 2];

        item.codigoInvalido = await valCodigo(item.codigo);
        item.cantidadInvalida = await valCantidad(item.cantidad);
        item.valorInvalido = await valValor(item.valor);

        data.push(item);
      }
    }
  }

  if (data.length == 0) {
    await procesaOcrSearaEstrategia3(ocr, ocrPL, nroDespacho);
  } else {
    try {
      await imp_importacion_archivo.update(
        { detalles: JSON.stringify(data) },
        { where: { nroDespacho: nroDespacho } }
      );
    } catch (error) {
      console.log(error);
    }
  }
};

const procesaOcrSearaMaritimo = async (ocr, ocrPL, nroDespacho) => {
  var data = [];

  let paginasFactura = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("COMMERCIAL INVOICE")) {
      paginasFactura.push(i);
    }
  }

  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");

    let item = {
      cantidad: "0",
      codigo: "",
      descripcion: "",
      valor: "0",
      peso: "0",
      codigoInvalido: false,
      cantidadInvalida: false,
      valorInvalido: false,
    };
    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      let textoLineaSiguiente = "";
      if (i < tabla.length - 1) {
        textoLineaSiguiente = tabla[i + 1].toUpperCase();
      }
      if (texto.includes("NET WEIGHT")) {
        let lineapeso = tabla[i + 1].split("\t")[1];
        item.peso = lineapeso;
      }
      if (texto.includes("P.O.#")) {
        let lineacod = tabla[i].split("\t")[0].split(" ");
        item.codigo = lineacod[lineacod.length - 1];

        let lineavalor = tabla[i - 3].split("\t");
        item.valor = lineavalor[lineavalor.length - 2]
          .replace(/\./g, "")
          .replace(/,/g, ".");
      }
      if (texto.includes("OF CARTONS")) {
        let lineaqty = tabla[i].split("\t")[0].split("ED:");
        item.cantidad = lineaqty[1].replace(/\./g, "").replace(/,/g, ".");
      }
    }
    item.codigoInvalido = await valCodigo(item.codigo);
    item.cantidadInvalida = await valCantidad(item.cantidad);
    item.valorInvalido = await valValor(item.valor);

    data.push(item);
  }

  if (data.length == 0) {
    console.log("No se encontraron datos en la factura comercial");
    //await procesaOcrSearaEstrategia2(ocr, nroDespacho);
  } else {
    try {
      await imp_importacion_archivo.update(
        { detalles: JSON.stringify(data) },
        { where: { nroDespacho: nroDespacho } }
      );
    } catch (error) {
      console.log(error);
    }
  }

  //  Procesa PACKING LIST
  //Se busca la pagina que contiene el packing list
  //Se busca la tabla que contiene los datos del packing list

  let paginasPackingList = [];
  let dataPacking = [];

  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("PACKING LIST")) {
      paginasPackingList.push(i);
    }
  }

  for (let [j, pagina] of paginasPackingList.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      let textoLineaSiguiente = "";
      if (i < tabla.length - 1) {
        textoLineaSiguiente = tabla[i + 1].toUpperCase();
      }

      if (texto.includes("DESCRIPTION")) {
        let indInicio = i + 1;
        for (let k = indInicio; k < indInicio + 100; k++) {
          if (k >= tabla.length) {
            break;
          }
          let linea = tabla[k].split("\t");
          let item = {
            descripcion: "",
            fechaProduccion: "",
            sif: "",
            fechaVencimiento: "",
            CajasPallet: "",
            PesoNeto: "",
            PesoBruto: "",
            vencimientoInvalido: false,
            pesonetoInvalido: false,
            pesobrutoInvalido: false,
          };
          if (linea.length > 6) {
            item.descripcion = linea[0];
            item.fechaProduccion = linea[linea.length - 8];
            item.sif = linea[linea.length - 6];
            let f = linea[linea.length - 5].replace("'", "/");
            if (f.length == 10) {
              let ano = f.slice(0, 4);
              let mes = f.slice(5, 7);
              let dia = f.slice(8, 10);
              item.fechaVencimiento = `${ano}/${mes}/${dia}`;
            } else {
              item.fechaVencimiento = linea[linea.length - 5].replace("'", "/");
            }
            item.CajasPallet = linea[linea.length - 4].replace(/[^\d,\.]/g, "");
            item.PesoNeto = linea[linea.length - 3]
              ? linea[linea.length - 3]
                  .replace(/[^\d,\.]/g, "")
                  .replace(/,/g, "")
              : "";
            item.PesoBruto = linea[linea.length - 2]
              ? linea[linea.length - 2]
                  .replace(/[^\d,\.]/g, "")
                  .replace(/,/g, "")
              : "";
            item.vencimientoInvalido = await valFecha(item.fechaVencimiento);
            item.pesonetoInvalido = await valCantidad(item.PesoNeto);
            item.pesobrutoInvalido = await valCantidad(item.PesoBruto);
            dataPacking.push(item);
          }
        }
        try {
          await imp_importacion_archivo.update(
            { packingList: JSON.stringify(dataPacking) },
            { where: { nroDespacho: nroDespacho } }
          );
        } catch (error) {
          console.log(error);
        }
      }
    }
  }
};

module.exports = procesaOcrSeara;
