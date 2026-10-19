// Own acceptance profiles only. Never read or modify the user's database.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
const profile=path.resolve(process.argv[2]??'');
const temporary=path.resolve('_research/temp');
if(!profile.startsWith(temporary+path.sep))throw Error('Fixture must remain under the workspace acceptance directory');
mkdirSync(profile,{recursive:true});const file=path.join(profile,'pluely.db');if(existsSync(file))throw Error('Do not overwrite an existing fixture database');
const db=new DatabaseSync(file);
db.exec('CREATE TABLE _sqlx_migrations(version BIGINT PRIMARY KEY,description TEXT NOT NULL,installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,success BOOLEAN NOT NULL,checksum BLOB NOT NULL,execution_time BIGINT NOT NULL)');
for(const [version,name,description] of [[1,'system-prompts.sql','create_system_prompts_table'],[2,'chat-history.sql','create_chat_history_tables']]){
 const sql=readFileSync(path.join('src-tauri/src/db/migrations',name),'utf8');db.exec(sql);
 db.prepare('INSERT INTO _sqlx_migrations(version,description,success,checksum,execution_time) VALUES(?,?,1,?,0)').run(version,description,createHash('sha384').update(sql).digest());
}
db.exec("CREATE TABLE preserved_migration_3(value TEXT); INSERT INTO preserved_migration_3 VALUES('preserve-upgrade-fixture'); INSERT INTO conversations VALUES('legacy-upgrade-fixture','Preserved legacy conversation',1000,1000); INSERT INTO messages VALUES('legacy-question','legacy-upgrade-fixture','user','Preserved legacy question',1000,NULL); INSERT INTO messages VALUES('legacy-answer','legacy-upgrade-fixture','assistant','Preserved legacy answer',2000,NULL)");
db.prepare('INSERT INTO _sqlx_migrations(version,description,success,checksum,execution_time) VALUES(3,?,1,?,0)').run('previously_applied_compatibility_fixture',createHash('sha384').update('previous released migration').digest());
db.close();console.log('Owned upgrade fixture: migrations 1/2/3, preserved data and legacy chat.');
