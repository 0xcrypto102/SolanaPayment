import * as anchor from "@coral-xyz/anchor";
import * as web3 from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { SolPayment } from "../target/types/sol_payment";
import { SystemProgram, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createAccount, createAssociatedTokenAccount, createMint, getAssociatedTokenAddress, mintTo, mintToChecked } from "@solana/spl-token";
import assert from "assert";
import { ASSOCIATED_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";

describe("sol_payment", async () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.SolPayment as Program<SolPayment>;
  
  let connection: web3.Connection;
  let splToken: PublicKey;
  let mystate, vault, depositInfoAccount,withdrawInfoAccount, vaultForAtaAccount : PublicKey;
  let mystateBump, vaultBump, depositInfoAccountBump,withdrawInfoAccountBump, vaultForAtaAccountBump : number;


  let owner = Keypair.fromSecretKey(
    Uint8Array.from([/* */])
  );
  
  let authority = Keypair.fromSecretKey(
     Uint8Array.from([/* */])
  );

  let feePayer = Keypair.fromSecretKey(
    Uint8Array.from([/* */])
  );




  before(async () => {
    // Connect to the local Solana cluster
    connection = new web3.Connection("https://api.devnet.solana.com", "confirmed");
    // Configure the client to use the local cluster
    anchor.setProvider(anchor.AnchorProvider.env());
    // Initialize the HadesPayment program
  });
  it("Mint Tokens!", async () => {
    await sleep(2000); // Adjust the wait time as needed
    // Create a new antCoin token
    splToken = await createMint(
      connection, // conneciton
      feePayer, // fee payer
      feePayer.publicKey, // mint authority
      null, // freeze authority (you can use `null` to disable it. when you disable it, you can't turn it on again)
      6 // decimals
    );
    console.log(`splToken: ${splToken.toBase58()}`);
  });

  it("PDA Accounts!", async() => {
    [mystate, mystateBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("MY-STATE-SEED")],
      program.programId
    );
  
    [vault, vaultBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("VAULT-SEED")],
      program.programId
    );
  
    [depositInfoAccount, depositInfoAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("DEPOSIT-STATE-SEED"), owner.publicKey.toBuffer()],
      program.programId
    );
  
    [withdrawInfoAccount, withdrawInfoAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("WITHDRAW-STATE-SEED"), owner.publicKey.toBuffer()],
      program.programId   
    );
  
    [vaultForAtaAccount, vaultForAtaAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("SPL-STATE-SEED"),splToken.toBuffer()],
      // [Buffer.from("SPL-STATE-SEED")],
      program.programId   
    );
  })

  it("Initializes MyState account", async () => {
    // Wait for the airdrop to be confirmed
    await sleep(2000); // Adjust the wait time as needed

    // Initialize MyState account
    try {
      const tx = await program.rpc.initialize({
        accounts: {
          signer: authority.publicKey,
          mystate: mystate,
          vault: vault,
          systemProgram: SystemProgram.programId,
        },
        signers: [authority], // Both mystate and authority are signers
      });
      console.log("Initialize success: tx ->: ", tx);
  
      // Fetch the initialized MyState account
      const myStateAccount = await program.account.myState.fetch(mystate);
      console.log("state account was created successfully: ", myStateAccount);

    } catch (error) {
      console.log(error);
    }
   
  });

  it("Should add and remove authorized addresses correctly", async () => {
    // Generate keypairs for the authority and new authorized address
    const newAddress = Keypair.generate();
     // Add the new address as an authorized address
     await program.rpc.addAuthorizedAddress(newAddress.publicKey, {
      accounts: {
        mystate: mystate,
        authority: authority.publicKey,
      },
      signers: [authority],
    });

    await program.rpc.addAuthorizedAddress(owner.publicKey, {
      accounts: {
        mystate: mystate,
        authority: authority.publicKey,
      },
      signers: [authority],
    });


    // Fetch the updated MyState account
    const updatedMyState = await program.account.myState.fetch(mystate);
    console.log("After add authorized address ->",updatedMyState);
    sleep(1500);

    // Remove the new address from the authorized addresses
    await program.rpc.removeAuthorizedAddress(newAddress.publicKey, {
      accounts: {
        mystate: mystate,
        authority: authority.publicKey,
      },
      signers: [authority],
    });

    // Fetch the updated MyState account again
    const finalMyState = await program.account.myState.fetch(mystate);

    // Check if the new address is removed from the authorized addresses
    console.log("Delete authorized address -> ", finalMyState);
  });

  it("Deposit SOL from users to the contract's account", async () => {
    // Define the amount of lamports to deposit
    const depositAamount = 100000000;
    // Deposit lamports into MyState account
    const txHash = await program.rpc.depositLamports(new anchor.BN(depositAamount), {
      accounts: {
        user: owner.publicKey,
        mystate,
        vault,
        depositInfoAccount,
        systemProgram: SystemProgram.programId,
      },
      signers: [owner],
    });

    // Fetch the initialized MyState account
    const myStateData = await program.account.myState.fetch(mystate);
    console.log("Deposit SOL successfully: ", myStateData);

    const depositInfoAccountData = await program.account.depositWallet.fetch(depositInfoAccount);
    console.log("Deposit info per wallet ", depositInfoAccountData);
  });

  it("Withdraw SOL from contract's account to the user", async () => {
    // Define the amount of lamports to withdraw
    const withdrawAmount = 100000000;
    // Withdraw lamports from MyState account to user
    await program.rpc.withdrawLamports(new anchor.BN(withdrawAmount),"withdraw success", {
      accounts: {
        user: owner.publicKey,
        mystate,
        vault,
        withdrawInfoAccount,
        systemProgram: SystemProgram.programId,
      },
      signers: [owner],
    });
   
    await sleep(2000); // Adjust the wait time as needed
   
     // Fetch the initialized MyState account
     const myStateData = await program.account.myState.fetch(mystate);
     console.log("Withdraw SOL successfully: ", myStateData);
 
     const withdrawInfoAccountData = await program.account.withdrawWallet.fetch(withdrawInfoAccount);
     console.log("Withdraw info per wallet ", withdrawInfoAccountData);
  });

  it("Deposits SPL tokens into the contract's account", async () => {
    // Create token accounts for the from and to accounts
    const fromAta = await createAssociatedTokenAccount(
      connection,
      feePayer,
      splToken,
      owner.publicKey
    );

    // Mint tokens to the 'from' associated token account
    const mintAmount = 1000000000;
    try {
      const tx = await mintToChecked(
        connection,
        feePayer,
        splToken,
        fromAta,
        feePayer,
        mintAmount,
        6
      );

      console.log(tx);
    } catch (error) {
      console.log(error);
    }
    // Send transaction
    sleep(3000);
    const transferAmount = 100000000;
    try {
      await program.rpc.depositSpl(new anchor.BN(transferAmount), {
        accounts: {
          user: owner.publicKey,
          mystate,
          tokenForDeposit: splToken,
          fromAta,
          vaultForAta: vaultForAtaAccount,
          depositInfoAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        },
        signers: [owner],
      });
    } catch (error) {
      console.log(error);
    }

    
    await sleep(2000); // Adjust the wait time as needed
  
    // Fetch the initialized MyState account
    const myStateData = await program.account.myState.fetch(mystate);
    console.log("Deposit SPL successfully: ", myStateData);

    const depositInfoAccountData = await program.account.depositWallet.fetch(depositInfoAccount);
    console.log("Deposit SPL info per wallet ", depositInfoAccountData);
 
  });

  it("WithDraw SPL tokens into the contract's account", async () => {
    // Create token accounts for the from and to accounts
    const toAta = await getAssociatedTokenAddress(
      splToken,
      owner.publicKey
    );

    // Send transaction
    sleep(2000);
    const transferAmount = 10000000;
    // try {
    //   await program.rpc.withdrawSpl(new anchor.BN(transferAmount),"withdraw spl success", {
    //     accounts: {
    //       user: owner.publicKey,
    //       mystate,
    //       tokenForWithdraw: splToken,
    //       toAta,
    //       vaultForAta: vaultForAtaAccount,
    //       withdrawInfoAccount,
    //       tokenProgram: TOKEN_PROGRAM_ID,
    //       systemProgram: SystemProgram.programId,
    //     },
    //     signers: [owner],
    //   });
    // } catch (error) {
    //   console.log(error);d
    // }

    
    await sleep(2000); // Adjust the wait time as needed
  
    // Fetch the initialized MyState account
    const myStateData = await program.account.myState.fetch(mystate);
    console.log("WithDraw SPL successfully: ", myStateData);

    const withdrawInfoAccountData = await program.account.withdrawWallet.fetch(withdrawInfoAccount);
    console.log("WithDraw SPL info per wallet ", withdrawInfoAccountData);
 
  });
 
});

// Utility function to sleep for a specified duration
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
