// Fase 14: el mosaico de fondo de la pantalla de búsqueda.
//
// Diez fotografías reales de sitios del mundo, fijas. No cambian con la
// búsqueda, así que no hacen falta ni proveedor, ni caché, ni clave de nadie:
// es una lista de constantes. Regla 4 de CLAUDE.md, sin rozarla siquiera.
//
// Son ficheros de Wikimedia Commons y casi todas piden citar autor y licencia,
// así que la atribución viaja aquí al lado de la URL y no en un documento
// aparte que se queda viejo. El pie de la pantalla la pinta desde esta misma
// lista: si un día se cambia una foto, la atribución cambia con ella.

export interface CollagePhoto {
  /** URL del fichero en Wikimedia Commons. */
  url: string;
  /** Qué se ve. No se usa como `alt` —el mosaico es decorativo— sino en el pie. */
  title: string;
  author: string;
  license: string;
  /** Página del fichero en Commons, con la licencia completa. */
  source: string;
}

export const WORLD_COLLAGE_PHOTOS: CollagePhoto[] = [
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Aerial_Foz_de_Igua%C3%A7u_26_Nov_2005.jpg',
    title: 'Cataratas del Iguazú',
    author: 'Mariordo (Mario Roberto Durán Ortiz)',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Aerial_Foz_de_Igua%C3%A7u_26_Nov_2005.jpg',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/3e/Pek%C3%ADn_hutongs_agosto_2004.JPG',
    title: 'Hutongs de Pekín',
    author: 'Autor desconocido',
    license: 'Dominio público',
    source: 'https://commons.wikimedia.org/wiki/File:Pek%C3%ADn_hutongs_agosto_2004.JPG',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Rocinha_1_by_Diego_Baravelli.jpg',
    title: 'Rocinha, Río de Janeiro',
    author: 'Diego Baravelli',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Rocinha_1_by_Diego_Baravelli.jpg',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/7/72/Angkor_wat_temple.jpg',
    title: 'Angkor Wat',
    author: 'Fuzheado',
    license: 'CC BY-SA 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Angkor_wat_temple.jpg',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/6/60/Matterhorn_from_Domh%C3%BCtte_-_2.jpg',
    title: 'El Cervino desde la Domhütte',
    author: 'chil / Zacharie Grossen',
    license: 'CC BY-SA 3.0',
    source: 'https://commons.wikimedia.org/wiki/File:Matterhorn_from_Domh%C3%BCtte_-_2.jpg',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/31/Turkey_%2868742801%29.jpeg',
    title: 'Capadocia, Turquía',
    author: 'Antonio Cristofaro',
    license: 'CC BY 3.0',
    source: 'https://commons.wikimedia.org/wiki/File:Turkey_(68742801).jpeg',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/2/2a/Bora_Bora_ISS006.jpg',
    title: 'Bora Bora desde la Estación Espacial',
    author: 'NASA Johnson Space Center',
    license: 'Dominio público',
    source: 'https://commons.wikimedia.org/wiki/File:Bora_Bora_ISS006.jpg',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/8/84/Merzouga_Dunes_2011.jpg',
    title: 'Dunas de Merzouga',
    author: 'Bjørn Christian Tørrissen',
    license: 'CC BY-SA 3.0',
    source: 'https://commons.wikimedia.org/wiki/File:Merzouga_Dunes_2011.jpg',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/af/Grand_Canyon_view_from_Pima_Point_2010.jpg',
    title: 'Gran Cañón desde Pima Point',
    author: 'Chensiyuan',
    license: 'CC BY-SA 4.0',
    source:
      'https://commons.wikimedia.org/wiki/File:Grand_Canyon_view_from_Pima_Point_2010.jpg',
  },
  {
    url: 'https://upload.wikimedia.org/wikipedia/commons/d/d3/Aurora_borealis_over_Eielson_Air_Force_Base%2C_Alaska.jpg',
    title: 'Aurora boreal en Alaska',
    author: 'Joshua Strang (US Air Force)',
    license: 'Dominio público',
    source:
      'https://commons.wikimedia.org/wiki/File:Aurora_borealis_over_Eielson_Air_Force_Base,_Alaska.jpg',
  },
];
